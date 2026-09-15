import type { HarnessEvent } from "../types.ts";
export function applyCodexActivity(current: { turnId: string | null; working: boolean }, event: HarnessEvent) {
	const begins = event.kind === "prompt" || event.kind === "working";
	if (!begins && event.turnId !== undefined && current.turnId !== null && current.turnId !== event.turnId) return;
	if (event.turnId !== undefined) current.turnId = event.turnId;
	if (event.kind !== "session" && event.kind !== "message")
		current.working = event.kind !== "idle" && (event.kind !== "error" || event.willRetry === true);
}
