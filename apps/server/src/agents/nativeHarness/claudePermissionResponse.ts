export function claudePermissionResponse(
	requestId: string,
	decision: { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string },
) {
	return Buffer.from(
		`${JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: requestId, response: decision } })}\n`,
	).toString("base64");
}
