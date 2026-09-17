import type { HarnessEvent } from "../types.ts";

// The turn a bridge control socket may interrupt, and whether that turn is
// still running. A bridge feeds every mapped harness event through here so
// its control socket refuses a stale turn id.
export function applyTurnActivity(current: { turnId: string | null; working: boolean }, event: HarnessEvent) {
	const begins = event.kind === "prompt" || event.kind === "working";
	if (!begins && event.turnId !== undefined && current.turnId !== null && current.turnId !== event.turnId) return;
	if (event.turnId !== undefined) current.turnId = event.turnId;
	if (event.kind !== "session" && event.kind !== "message")
		current.working = event.kind !== "idle" && (event.kind !== "error" || event.willRetry === true);
}
