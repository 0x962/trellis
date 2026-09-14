export function claudeInitialize(requestId: string) {
	return Buffer.from(
		`${JSON.stringify({ type: "control_request", request_id: requestId, request: { subtype: "initialize", hooks: null } })}\n`,
	).toString("base64");
}
