import type { HarnessEvent } from "@trellis/runtime-protocol";

export function validateHarnessEvent(value: unknown): asserts value is HarnessEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A provider event is required");
	const event = value as Record<string, unknown>;
	if (
		!["session", "prompt", "working", "idle", "message", "tool-start", "tool-update", "tool-end", "error"].includes(
			event.kind as string,
		)
	)
		throw new Error("Unknown provider event kind");
	for (const field of ["sessionId", "model", "prompt", "result", "error", "turnId"])
		if (event[field] !== undefined && (typeof event[field] !== "string" || (event[field] as string).length > 200000))
			throw new Error(`Provider ${field} must be a string of at most 200000 characters`);
	if (event.willRetry !== undefined && typeof event.willRetry !== "boolean")
		throw new Error("Provider willRetry must be a boolean");
	if (
		event.tokenUsage !== undefined &&
		(typeof event.tokenUsage !== "object" ||
			event.tokenUsage === null ||
			!Number.isSafeInteger((event.tokenUsage as Record<string, unknown>).totalTokens) ||
			((event.tokenUsage as Record<string, number>).totalTokens ?? -1) < 0)
	)
		throw new Error("Provider token usage requires a nonnegative safe integer total");
	if (event.outcome !== undefined && !["completed", "interrupted", "failed"].includes(event.outcome as string))
		throw new Error("Unknown provider turn outcome");
	if (event.kind === "prompt" && typeof event.prompt !== "string") throw new Error("A provider prompt is required");
	if (event.kind === "error" && typeof event.error !== "string") throw new Error("A provider error is required");
	if (event.kind === "message" || event.message !== undefined) {
		const message = event.message as Record<string, unknown> | undefined;
		if (!message || typeof message.text !== "string" || message.text.length > 200000)
			throw new Error("A provider message requires text of at most 200000 characters");
		if (message.at !== undefined && (typeof message.at !== "string" || !Number.isFinite(Date.parse(message.at))))
			throw new Error("A provider message timestamp must be a date string");
	}
	if (event.tool !== undefined || (event.kind as string).startsWith("tool-")) {
		const tool = event.tool as Record<string, unknown> | undefined;
		if (
			!tool ||
			typeof tool !== "object" ||
			typeof tool.id !== "string" ||
			!tool.id ||
			typeof tool.name !== "string" ||
			!tool.name
		)
			throw new Error("A provider tool identifier and name are required");
	}
}
