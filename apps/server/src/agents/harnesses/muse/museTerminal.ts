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

const ESCAPE = "\u001b";
const escapeSequence = new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, "g");
// The reader below holds the event loop of the bridge open, so the bridge
// calls `stopMuseTerminal` before it exits. That call can run while the
// bridge still waits for Muse, and the bridge reaches `readMuseTerminal`
// after it. `released` keeps the reader shut in that order.
let released = false;

// Reads the terminal of the bridge for a follow-up prompt. The terminal is in
// raw mode, so Ctrl+C reaches the bridge as a byte and never as a signal to
// the session host. Text collects until Enter and then starts a turn. A
// bracketed paste keeps its text only.
export function readMuseTerminal(options: {
	current: () => { turnId: string | null; working: boolean };
	interrupt: (turnId: string) => Promise<unknown>;
	submit: (prompt: string) => Promise<unknown>;
	onFailure: (error: unknown) => void;
}) {
	if (released || !process.stdin.isTTY) return;
	process.stdin.setRawMode(true);
	process.stdin.resume();
	let line = "";
	process.stdin.on("data", (chunk: Buffer) => {
		const text = chunk
			.toString()
			.replaceAll(`${ESCAPE}[200~`, "")
			.replaceAll(`${ESCAPE}[201~`, "")
			.replace(escapeSequence, "");
		for (const character of text) {
			if (character === "\x03") {
				line = "";
				const current = options.current();
				if (current.working && current.turnId !== null) void options.interrupt(current.turnId).catch(options.onFailure);
			} else if (character === "\r" || character === "\n") {
				process.stdout.write("\n");
				const prompt = line;
				line = "";
				if (prompt.trim() === "") continue;
				void options.submit(prompt).catch(options.onFailure);
			} else if (character === "\x7f" || character === "\b") {
				if (line.length > 0) {
					line = line.slice(0, -1);
					process.stdout.write("\b \b");
				}
			} else if (character >= " ") {
				line += character;
				process.stdout.write(character);
			}
		}
	});
}

// Leaves the terminal as the bridge found it and stops the reader.
export function stopMuseTerminal() {
	released = true;
	if (!process.stdin.isTTY) return;
	process.stdin.setRawMode(false);
	process.stdin.pause();
}
