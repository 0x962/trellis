export const museTerminalHint = "Type a message and press Enter to send it. Press Ctrl+C to interrupt the turn.";

const ESCAPE = "\u001b";
const escapeSequence = new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, "g");
// `start()` in `muse/bridgeEntry.ts` calls `startMuseTerminalReader` late. The
// bridge can fail for a reason that `start()` does not see, so
// `stopMuseTerminalReader` runs while `start()` still waits for Muse.
// `stoppedForGood` makes that late call do nothing. A late reader puts the
// terminal back into raw mode after the bridge gave it to the person, and it
// holds the process open.
let stoppedForGood = false;

// The terminal is in raw mode, so Ctrl+C reaches the bridge as a byte and
// never as a signal to the session host. Text collects until Enter and then
// starts a turn. A bracketed paste keeps its text only.
// Answers whether the reader took the terminal. A caller prints its invitation
// to type only after a reader takes it.
export function startMuseTerminalReader(options: {
	interrupt: () => Promise<unknown>;
	submit: (prompt: string) => Promise<unknown>;
	onFailure: (error: unknown) => void;
}): boolean {
	if (stoppedForGood || !process.stdin.isTTY) return false;
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
				void options.interrupt().catch(options.onFailure);
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
	return true;
}

export function stopMuseTerminalReader() {
	stoppedForGood = true;
	if (!process.stdin.isTTY) return;
	process.stdin.setRawMode(false);
	process.stdin.pause();
}
