export function claudeUserMessage(sessionId: string, messageId: string, text: string) {
	return Buffer.from(
		`${JSON.stringify({ type: "user", uuid: messageId, session_id: sessionId, message: { role: "user", content: text }, parent_tool_use_id: null })}\n`,
	).toString("base64");
}
