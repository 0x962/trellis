import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ClaudeStream } from "./claudeStream.ts";

export async function observeClaude(
	client: RuntimeClient,
	attemptId: string,
	sessionId: string,
	initializeId?: string,
) {
	const output = await client.output(attemptId);
	const parser = new ClaudeStream(sessionId, initializeId);
	if (output.truncated) parser.gap();
	parser.feed(Buffer.from(output.data, "base64"));
	return parser.snapshot();
}
