import type { HarnessEvent } from "../types.ts";

// The text the bridge prints for one harness event. The terminal of a Muse
// agent is this transcript: Muse has no terminal client that can attach to
// a session host, so the bridge prints what it observes.
//
// A prompt that Trellis sent starts with a `trellis-message:<id>` line. The
// line is the receipt of that message and carries no meaning for a reader,
// so the transcript drops it.
export function museTranscriptLine(event: HarnessEvent): string | null {
	switch (event.kind) {
		case "session":
			return event.model ? `Muse · ${event.model}${event.sessionId ? ` · session ${event.sessionId}` : ""}` : null;
		case "prompt":
			return `\n❯ ${(event.prompt ?? "").replace(/^trellis-message:[^\n]*\r?\n?/, "")}`;
		case "tool-start": {
			const input = event.tool?.input;
			const summary = typeof input === "string" ? input : input === undefined ? "" : JSON.stringify(input);
			return `◆ ${event.tool?.name}${summary ? ` ${summary.slice(0, 200)}` : ""}`;
		}
		case "tool-end":
			return event.error ? `  ✗ ${event.tool?.name}: ${event.error}` : `  ✓ ${event.tool?.name}`;
		case "message":
			return `◆ ${event.message?.text ?? ""}`;
		case "idle":
			return event.outcome === "interrupted" ? "─ interrupted" : "─ done";
		case "error":
			return event.willRetry ? `! retrying: ${event.error}` : `! ${event.error}`;
		default:
			return null;
	}
}

export const museTerminalHint = "Type a message and press Enter to send it. Press Ctrl+C to interrupt the turn.";
