import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { terminalResize } from "./terminalResize";

// terminalResize asks the page for an animation frame and for a ResizeObserver.
// A test process has neither, so each test installs one. frames holds the
// callback of each requestAnimationFrame under the number it answered, and
// sizeObserver holds the callback the ResizeObserver was built with.
const frames = new Map<number, () => void>();
let frameCount = 0;
let sizeObserver: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null = null;
const runFrames = () => {
	for (const [handle, frame] of [...frames]) {
		frames.delete(handle);
		frame();
	}
};
const resizeTo = (width: number, height: number) => sizeObserver?.([{ contentRect: { width, height } }]);
// The observer of terminalResize waits 75 ms before it fits.
const afterObserverWait = () => new Promise((resolve) => setTimeout(resolve, 120));
const page = globalThis as unknown as Record<string, unknown>;
const original: Record<string, unknown> = {};

beforeEach(() => {
	for (const name of ["requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver"]) original[name] = page[name];
	frames.clear();
	frameCount = 0;
	sizeObserver = null;
	page.requestAnimationFrame = (callback: () => void) => {
		frameCount += 1;
		frames.set(frameCount, callback);
		return frameCount;
	};
	page.cancelAnimationFrame = (handle: number) => frames.delete(handle);
	page.ResizeObserver = class {
		constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
			sizeObserver = callback;
		}
		observe() {}
		disconnect() {}
	};
});

afterEach(() => {
	for (const [name, value] of Object.entries(original)) page[name] = value;
});

// A terminal that records what terminalResize asks it to do. "newest" is a
// call to scrollToBottom, which puts the viewport on the last line of the
// buffer. "line <n>" is a call to scrollToLine, which puts the viewport on
// line n. pendingWrites holds the callback that xterm runs when it finishes
// a write, and a test calls it to finish that write.
const fakeTerminal = () => {
	const buffer = { viewportY: 0, baseY: 0 };
	const moves: string[] = [];
	const sizes: [number, number][] = [];
	const pendingWrites: (() => void)[] = [];
	const terminal = {
		cols: 80,
		rows: 24,
		buffer: { active: buffer },
		scrollToBottom() {
			moves.push("newest");
			buffer.viewportY = buffer.baseY;
		},
		scrollToLine(line: number) {
			moves.push(`line ${line}`);
			buffer.viewportY = line;
		},
		refresh() {},
		write(_bytes: Uint8Array, complete: () => void) {
			pendingWrites.push(complete);
		},
	} as unknown as Terminal;
	const fit = { fit() {} } as unknown as FitAddon;
	const resize = terminalResize(terminal, fit, (cols, rows) => sizes.push([cols, rows]));
	const host = { clientWidth: 900, clientHeight: 600 } as unknown as HTMLElement;
	return { buffer, moves, sizes, pendingWrites, resize, host };
};

describe("terminalResize", () => {
	test("a view that opens on a terminal the person scrolled shows the newest output", () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.buffer.viewportY = 500;

		terminal.resize.attach(terminal.host);
		runFrames();

		expect(terminal.moves).toEqual(["newest"]);
		expect(terminal.buffer.viewportY).toBe(900);
		expect(terminal.sizes).toEqual([[80, 24]]);
	});

	test("a fit after the view opened keeps the line the person reads", () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.resize.attach(terminal.host);
		runFrames();
		terminal.buffer.viewportY = 500;

		terminal.resize.request();

		expect(terminal.moves).toEqual(["newest", "line 500"]);
		expect(terminal.buffer.viewportY).toBe(500);
	});

	test("a view that opens while output is still parsed shows the newest output after that write", async () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.buffer.viewportY = 500;
		terminal.resize.attach(terminal.host);
		let written = false;
		terminal.resize.write(new Uint8Array([65]), () => {
			written = true;
		});

		runFrames();
		expect(terminal.moves).toEqual([]);

		terminal.pendingWrites.shift()?.();
		await Promise.resolve();

		expect(written).toBe(true);
		expect(terminal.moves).toEqual(["newest"]);
		expect(terminal.buffer.viewportY).toBe(900);
	});

	test("a view that leaves and opens again shows the newest output", () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.resize.attach(terminal.host);
		runFrames();
		terminal.buffer.viewportY = 500;
		terminal.resize.detach();

		terminal.resize.attach(terminal.host);
		runFrames();

		expect(terminal.moves).toEqual(["newest", "newest"]);
		expect(terminal.buffer.viewportY).toBe(900);
	});

	test("a view that leaves before its first fit fits one time when it opens again", () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.buffer.viewportY = 500;
		terminal.resize.attach(terminal.host);
		terminal.resize.detach();

		terminal.resize.attach(terminal.host);
		runFrames();

		expect(terminal.moves).toEqual(["newest"]);
		expect(terminal.buffer.viewportY).toBe(900);
	});

	test("a host that loses its size and gets it again shows the newest output", async () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.resize.attach(terminal.host);
		runFrames();
		terminal.buffer.viewportY = 500;

		resizeTo(0, 0);
		resizeTo(900, 600);
		await afterObserverWait();

		expect(terminal.moves).toEqual(["newest", "newest"]);
		expect(terminal.buffer.viewportY).toBe(900);
	});

	test("a host that comes back sends its size although a fit ran while output was parsed", async () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.resize.attach(terminal.host);
		runFrames();
		terminal.resize.write(new Uint8Array([65]), () => {});

		resizeTo(600, 400);
		await afterObserverWait();
		resizeTo(0, 0);
		resizeTo(900, 600);
		terminal.pendingWrites.shift()?.();
		await afterObserverWait();

		expect(terminal.sizes).toEqual([
			[80, 24],
			[80, 24],
		]);
	});

	test("a host that changes size while the person reads keeps the line", async () => {
		const terminal = fakeTerminal();
		terminal.buffer.baseY = 900;
		terminal.resize.attach(terminal.host);
		runFrames();
		terminal.buffer.viewportY = 500;

		resizeTo(600, 400);
		await afterObserverWait();

		expect(terminal.moves).toEqual(["newest", "line 500"]);
		expect(terminal.buffer.viewportY).toBe(500);
	});
});
