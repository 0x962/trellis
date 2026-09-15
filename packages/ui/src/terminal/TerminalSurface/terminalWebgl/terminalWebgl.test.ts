import { expect, test } from "bun:test";
import type { WebglAddon } from "@xterm/addon-webgl";
import { terminalWebgl } from "./terminalWebgl";

const fixture = (failActivation = false, failConstruction = false) => {
	let scheduled: (() => void) | undefined;
	let contextLoss = () => {};
	let pageAdded = () => {};
	let disposals = 0;
	let listenerDisposals = 0;
	let activations = 0;
	let atlasClears = 0;
	const refreshes: [number, number][] = [];
	const renderer = {
		activate: () => {},
		dispose: () => disposals++,
		onContextLoss: (callback: () => void) => {
			contextLoss = callback;
			return { dispose: () => listenerDisposals++ };
		},
		onAddTextureAtlasCanvas: (callback: () => void) => {
			pageAdded = callback;
			return { dispose: () => listenerDisposals++ };
		},
		clearTextureAtlas: () => atlasClears++,
	} as unknown as WebglAddon;
	const dispose = terminalWebgl(
		{
			loadAddon: () => {
				activations++;
				if (failActivation) throw new Error("WebGL2 is unavailable");
			},
			rows: 24,
			refresh: (start, end) => refreshes.push([start, end]),
		},
		() => {
			if (failConstruction) throw new Error("WebGL2 is unavailable");
			return renderer;
		},
		{
			schedule: (callback) => {
				scheduled = callback;
				return 1;
			},
			cancel: () => {
				scheduled = undefined;
			},
		},
	);
	return {
		dispose,
		open: () => scheduled?.(),
		loseContext: () => contextLoss(),
		addPage: () => pageAdded(),
		disposals: () => disposals,
		listenerDisposals: () => listenerDisposals,
		activations: () => activations,
		atlasClears: () => atlasClears,
		refreshes,
	};
};

test("WebGL activates after the terminal opens and releases a lost GPU context", () => {
	const gpu = fixture();
	expect(gpu.activations()).toBe(0);
	gpu.open();
	expect(gpu.activations()).toBe(1);
	gpu.loseContext();
	expect(gpu.disposals()).toBe(1);
	expect(gpu.listenerDisposals()).toBe(2);
	expect(gpu.refreshes).toEqual([[0, 23]]);
	gpu.dispose();
	expect(gpu.disposals()).toBe(1);
});

test("WebGL cleanup cancels activation when the terminal unmounts before the next frame", () => {
	const gpu = fixture();
	gpu.dispose();
	gpu.open();
	expect(gpu.activations()).toBe(0);
});

test("a GPU activation failure releases the addon and retains the terminal renderer", () => {
	const gpu = fixture(true);
	expect(() => gpu.open()).not.toThrow();
	expect(gpu.disposals()).toBe(1);
	expect(gpu.listenerDisposals()).toBe(2);
	expect(gpu.refreshes).toEqual([[0, 23]]);
	gpu.dispose();
	expect(gpu.disposals()).toBe(1);
});

test("an unsupported GPU retains the DOM renderer when addon construction fails", () => {
	const gpu = fixture(false, true);
	expect(() => gpu.open()).not.toThrow();
	expect(gpu.activations()).toBe(0);
	expect(gpu.refreshes).toEqual([[0, 23]]);
	gpu.dispose();
});

test("WebGL releases accumulated texture pages after the glyph draw completes", async () => {
	const gpu = fixture();
	gpu.open();
	for (let index = 0; index < 32; index++) gpu.addPage();
	expect(gpu.atlasClears()).toBe(0);
	await Promise.resolve();
	expect(gpu.atlasClears()).toBe(1);
	for (let index = 0; index < 32; index++) gpu.addPage();
	gpu.dispose();
	await Promise.resolve();
	expect(gpu.atlasClears()).toBe(1);
});
