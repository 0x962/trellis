import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { parseClaudeEvent } from "../harnesses/claude/parseClaudeEvent.ts";
import { readClaudeMessage } from "../harnesses/claude/readClaudeMessage/index.ts";
import { parseOpenCodeEvent } from "../harnesses/opencode/opencode.ts";
import { parsePiEvent } from "../harnesses/pi/pi.ts";

const env = z
	.object({
		TRELLIS_HARNESS: z.enum(["claude", "pi", "opencode"]),
		TRELLIS_HARNESS_SOCKET: z.string(),
		TRELLIS_ATTEMPT_ID: z.string(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
	})
	.parse(process.env);
const payload = JSON.parse(await Bun.stdin.text());
const parser = {
	claude: parseClaudeEvent,
	pi: parsePiEvent,
	opencode: parseOpenCodeEvent,
}[env.TRELLIS_HARNESS];
const runtime = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET);
let transcriptMessage: Awaited<ReturnType<typeof readClaudeMessage>> = null;
if (
	env.TRELLIS_HARNESS === "claude" &&
	typeof payload.agent_id !== "string" &&
	typeof payload.transcript_path === "string" &&
	["PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure"].includes(payload.hook_event_name)
) {
	transcriptMessage = await readClaudeMessage(payload.transcript_path, payload.session_id);
	if (transcriptMessage !== null)
		await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
			kind: "message",
			sessionId: payload.session_id,
			...(typeof payload.prompt_id === "string" ? { turnId: payload.prompt_id } : {}),
			message: { ...transcriptMessage, complete: false },
		});
}
for (const event of parser(payload))
	await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
		...event,
		...(env.TRELLIS_HARNESS === "claude" && (event.kind === "idle" || event.kind === "error")
			? { messageAvailability: "unavailable" as const }
			: {}),
		...(event.kind === "idle" && transcriptMessage !== null && event.result === transcriptMessage.text
			? { resultActivityIds: [transcriptMessage.id] }
			: {}),
	});
