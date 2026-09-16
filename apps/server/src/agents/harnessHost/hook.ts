import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { parseClaudeEvent } from "../harnesses/claude/parseClaudeEvent.ts";
import { readClaudeMessage } from "../harnesses/claude/readClaudeMessage/index.ts";
import { parseOpenCodeEvent } from "../harnesses/opencode/opencode.ts";
import { parsePiEvent } from "../harnesses/pi/pi.ts";
import { managerReadiness } from "../managerTools/managerReadiness.ts";

const env = z
	.object({
		TRELLIS_HARNESS: z.enum(["claude", "pi", "opencode"]),
		TRELLIS_HARNESS_SOCKET: z.string(),
		TRELLIS_ATTEMPT_ID: z.string(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
		TRELLIS_MANAGER_TOOLS_READY: z.string().optional(),
	})
	.parse(process.env);
const payload = JSON.parse(await Bun.stdin.text());
const parser = {
	claude: parseClaudeEvent,
	pi: parsePiEvent,
	opencode: parseOpenCodeEvent,
}[env.TRELLIS_HARNESS];
const runtime = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET);
if (
	env.TRELLIS_HARNESS === "claude" &&
	payload.hook_event_name === "UserPromptSubmit" &&
	env.TRELLIS_MANAGER_TOOLS_READY &&
	!managerReadiness.confirmed(env.TRELLIS_MANAGER_TOOLS_READY, env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN)
) {
	const error =
		"Trellis tools are not ready. Manager startup stopped before the prompt. Inspect the Trellis MCP connection.";
	process.stderr.write(`${error}\n`);
	setTimeout(() => process.exit(2), 2000);
	try {
		await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
			kind: "error",
			outcome: "failed",
			sessionId: payload.session_id,
			error,
		});
	} finally {
		process.exit(2);
	}
}

if (
	env.TRELLIS_HARNESS === "claude" &&
	typeof payload.transcript_path === "string" &&
	["PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure"].includes(payload.hook_event_name)
) {
	const message = await readClaudeMessage(payload.transcript_path, payload.session_id);
	if (message !== null)
		await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
			kind: "message",
			sessionId: payload.session_id,
			...(typeof payload.prompt_id === "string" ? { turnId: payload.prompt_id } : {}),
			message,
		});
}
for (const event of parser(payload)) await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
