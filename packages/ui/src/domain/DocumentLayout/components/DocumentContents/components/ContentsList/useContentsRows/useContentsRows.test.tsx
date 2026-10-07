import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import type { ContentsHeading } from "../../../DocumentContents";
import { useContentsRows } from "./useContentsRows";

test("row measurements share one frame, retain current sizes, and discard removed headings", async () => {
	const frames = new Map<number, FrameRequestCallback>();
	let nextFrame = 0;
	const globals = {
		window: new EventTarget(),
		IS_REACT_ACT_ENVIRONMENT: true,
		ResizeObserver: class {
			observe() {}
			disconnect() {}
		},
		getComputedStyle: () => ({ getPropertyValue: (key: string) => (key === "--spacing" ? "4px" : "8") }),
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		},
		cancelAnimationFrame: (id: number) => frames.delete(id),
	};
	const originals = Object.keys(globals).map(
		(name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
	);
	for (const [name, value] of Object.entries(globals))
		Object.defineProperty(globalThis, name, { configurable: true, value });
	const element = Object.assign(new EventTarget(), { clientWidth: 200, clientHeight: 400, scrollTop: 0 });
	const viewport = { current: element as unknown as HTMLDivElement };
	const headings = Array.from({ length: 1_000 }, (_, index) => ({
		id: `row-${index}`,
		level: 2,
		text: `Section ${index}`,
	}));
	let rows: ReturnType<typeof useContentsRows>;
	let renders = 0;
	function Probe({ items }: { items: readonly ContentsHeading[] }) {
		rows = useContentsRows(viewport, items);
		renders++;
		return null;
	}
	const root = createRoot();
	const iterator = Map.prototype[Symbol.iterator];
	let copies = 0;
	Map.prototype[Symbol.iterator] = function* () {
		for (const entry of iterator.call(this)) {
			if (entry[1]?.height !== undefined && entry[1]?.width !== undefined) copies++;
			yield entry;
		}
		return undefined;
	};
	const flush = () => {
		const callbacks = [...frames.values()];
		frames.clear();
		for (const callback of callbacks) callback(0);
	};
	try {
		await act(async () => root.render(<Probe items={headings} />));
		const initialRenders = renders;
		await act(async () => {
			for (const heading of headings) rows.measure({ ...heading, width: 200, height: 64 });
		});
		expect(copies).toBe(0);
		expect(frames.size).toBe(1);
		expect(renders).toBe(initialRenders);
		await act(async () => flush());
		expect(rows!.offsets.at(-1)).toBe(64_000);
		expect(renders).toBe(initialRenders + 1);
		await act(async () => rows.measure({ ...headings[0]!, width: 200, height: 64 }));
		expect(frames.size).toBe(0);
		await act(async () => root.render(<Probe items={headings.slice(1)} />));
		expect(rows!.offsets.at(-1)).toBe(63_936);
		await act(async () => root.render(<Probe items={headings} />));
		expect(rows!.offsets[1]).toBe(32);
		expect(rows!.offsets.at(-1)).toBe(63_968);
		await act(async () => rows.measure({ ...headings[0]!, width: 200, height: 80 }));
		await act(async () => flush());
		expect(rows!.offsets[1]).toBe(80);
		await act(async () => rows.measure({ ...headings[0]!, width: 200, height: 96 }));
		expect(frames.size).toBe(1);
	} finally {
		await act(async () => root.unmount());
		Map.prototype[Symbol.iterator] = iterator;
		for (const [name, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		}
	}
	expect(frames.size).toBe(0);
});
