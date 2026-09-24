import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { terminalResize } from "./terminalResize";

// terminalResize asks the page for an animation frame and for a ResizeObserver.
// A test process has neither, so each test installs one. The frames queue holds
// the callback of requestAnimationFrame until a test runs it.
const frames: (() => void)[] = [];
const runFrame = () => frames.shift()?.();
const page = globalThis as unknown as Record<string, unknown>;
const original: Record<string, unknown> = {};

beforeEach(() => {
	for (const name of ["requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver"]) original[name] = page[name];
	frames.length = 0;
	page.requestAnimationFrame = (callback: () => void) => frames.push(callback);
	page.cancelAnimationFrame = () => {};
	page.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
});

afterEach(() => {
	for (const [name, value] of Object.entries(original)) page[name] = value;
});

// Records what terminalResize asks a terminal to do. "newest" is a call to
// scrollToBottom, which puts the viewport on the last line of the buffer.
// "line <n>" is a call to scrollToLine, which puts the viewport on line n.
const setup = () => {
	const buffer = { viewportY: 0, baseY: 0 };
	const moves: string[] = [];
	const sizes: [number, number][] = [];
	const parsed: (() => void)[] = [];
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
			parsed.push(complete);
		},
	} as unknown as Terminal;
	const fit = { fit() {} } as unknown as FitAddon;
	const resize = terminalResize(terminal, fit, (cols, rows) => sizes.push([cols, rows]));
	const host = { clientWidth: 900, clientHeight: 600 } as unknown as HTMLElement;
	return { buffer, moves, sizes, parsed, resize, host };
};

describe("terminalResize", () => {
	test("a view that opens on a terminal the person scrolled shows the newest output", () => {
		const probe = setup();
		probe.buffer.baseY = 900;
		probe.buffer.viewportY = 500;

		probe.resize.attach(probe.host);
		runFrame();

		expect(probe.moves).toEqual(["newest"]);
		expect(probe.buffer.viewportY).toBe(900);
		expect(probe.sizes).toEqual([[80, 24]]);
	});

	test("a fit after the view opened keeps the line the person reads", () => {
		const probe = setup();
		probe.buffer.baseY = 900;
		probe.resize.attach(probe.host);
		runFrame();
		probe.buffer.viewportY = 500;

		probe.resize.request();

		expect(probe.moves).toEqual(["newest", "line 500"]);
		expect(probe.buffer.viewportY).toBe(500);
	});

	test("a view that opens while output is still parsed shows the newest output after that write", async () => {
		const probe = setup();
		probe.buffer.baseY = 900;
		probe.buffer.viewportY = 500;
		probe.resize.attach(probe.host);
		let written = false;
		probe.resize.write(new Uint8Array([65]), () => {
			written = true;
		});

		runFrame();
		expect(probe.moves).toEqual([]);

		probe.parsed.shift()?.();
		await Promise.resolve();

		expect(written).toBe(true);
		expect(probe.moves).toEqual(["newest"]);
		expect(probe.buffer.viewportY).toBe(900);
	});

	test("a view that leaves and opens again shows the newest output", () => {
		const probe = setup();
		probe.buffer.baseY = 900;
		probe.resize.attach(probe.host);
		runFrame();
		probe.buffer.viewportY = 500;
		probe.resize.detach();

		probe.resize.attach(probe.host);
		runFrame();

		expect(probe.moves).toEqual(["newest", "newest"]);
		expect(probe.buffer.viewportY).toBe(900);
	});
});
