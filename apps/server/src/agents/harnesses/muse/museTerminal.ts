export const museTerminalHint = "Type a message and press Enter to send it. Press Ctrl+C to interrupt the turn.";

const ESCAPE = "\u001b";
const escapeSequence = new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, "g");
// Starts a reader of the terminal of the bridge, for a follow-up prompt. The
// reader stays until `stopMuseTerminalReader` runs. The terminal is in raw
// mode, so Ctrl+C reaches the bridge as a byte and never as a signal to the
// session host. Text collects until Enter and then starts a turn. A bracketed
// paste keeps its text only.
export function startMuseTerminalReader(options: {
	interrupt: () => Promise<unknown>;
	submit: (prompt: string) => Promise<unknown>;
	onFailure: (error: unknown) => void;
}) {
	if (!process.stdin.isTTY) return;
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
}

export function stopMuseTerminalReader() {
	if (!process.stdin.isTTY) return;
	process.stdin.setRawMode(false);
	process.stdin.pause();
}
