import { afterEach, expect, test } from "bun:test";
import { startMuseTerminalReader, stopMuseTerminalReader } from "./museTerminal.ts";

// The reader takes the standard input of the process, so this test puts a
// stand-in terminal there and gives the real one back afterwards.
const realStdin = process.stdin;
const realWrite = process.stdout.write.bind(process.stdout);
afterEach(() => {
	Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
	process.stdout.write = realWrite;
});

function fakeTerminal() {
	const rawModes: boolean[] = [];
	let paused = false;
	let typed: ((chunk: Buffer) => void) | undefined;
	Object.defineProperty(process, "stdin", {
		configurable: true,
		value: {
			isTTY: true,
			setRawMode: (raw: boolean) => rawModes.push(raw),
			resume: () => {
				paused = false;
			},
			pause: () => {
				paused = true;
			},
			on: (event: string, handler: (chunk: Buffer) => void) => {
				if (event === "data") typed = handler;
			},
		},
	});
	// The reader echoes each typed character, so the test takes that output
	// instead of the terminal it runs in.
	let echo = "";
	process.stdout.write = ((text: string) => {
		echo += text;
		return true;
	}) as typeof process.stdout.write;
	return {
		rawModes,
		echo: () => echo,
		isPaused: () => paused,
		hasReader: () => typed !== undefined,
		type: (text: string) => typed?.(Buffer.from(text)),
	};
}

// `stopMuseTerminalReader` holds a stop for the life of the process, so this
// test walks the whole life of one reader in order.
test("the reader takes the terminal, gives it back, and takes it no second time", () => {
	const terminal = fakeTerminal();
	const prompts: string[] = [];
	let interrupts = 0;
	const options = {
		interrupt: async () => {
			interrupts += 1;
		},
		submit: async (prompt: string) => {
			prompts.push(prompt);
		},
		onFailure: () => {},
	};

	startMuseTerminalReader(options);
	expect(terminal.rawModes).toEqual([true]);
	terminal.type("hello\r");
	terminal.type("\x03");
	expect(prompts).toEqual(["hello"]);
	expect(interrupts).toBe(1);
	expect(terminal.echo()).toBe("hello\n");

	stopMuseTerminalReader();
	expect(terminal.rawModes).toEqual([true, false]);
	expect(terminal.isPaused()).toBe(true);

	// The bridge can stop the reader while `start` still waits for Muse, and
	// `start` reaches the reader after that. A reader that starts then holds
	// the bridge process alive.
	const second = fakeTerminal();
	startMuseTerminalReader(options);
	expect(second.hasReader()).toBe(false);
	expect(second.rawModes).toEqual([]);
});
