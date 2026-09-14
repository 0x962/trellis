import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { claudeUserMessage } from "./claudeUserMessage.ts";

export function sendClaude(
	client: RuntimeClient,
	attemptId: string,
	sessionId: string,
	messageId: string,
	text: string,
) {
	return client.deliver(attemptId, messageId, claudeUserMessage(sessionId, messageId, text));
}
