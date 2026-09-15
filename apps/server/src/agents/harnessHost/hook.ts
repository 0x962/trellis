import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { parseClaudeEvent } from "../harnesses/claude/parseClaudeEvent.ts";
import { parseCodexEvent } from "../harnesses/codex/parseCodexEvent.ts";
import { parseOpenCodeEvent } from "../harnesses/opencode/opencode.ts";
import { parsePiEvent } from "../harnesses/pi/pi.ts";

const env = z
	.object({
		TRELLIS_HARNESS: z.enum(["claude", "codex", "pi", "opencode"]),
		TRELLIS_HARNESS_SOCKET: z.string(),
		TRELLIS_ATTEMPT_ID: z.string(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
	})
	.parse(process.env);
const payload = JSON.parse(await Bun.stdin.text());
const parser = {
	claude: parseClaudeEvent,
	codex: parseCodexEvent,
	pi: parsePiEvent,
	opencode: parseOpenCodeEvent,
}[env.TRELLIS_HARNESS];
const runtime = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET);
for (const event of parser(payload)) await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
