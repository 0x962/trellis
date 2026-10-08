import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { useVirtualRows } from "./useVirtualRows";

test("the final row keeps the full viewport mounted when the browser clamps the scroll", async () => {
	const originals = ["window", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"].map(
		(name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
	);
	Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
	Object.defineProperty(globalThis, "ResizeObserver", {
		configurable: true,
		value: class {
			observe() {}
			disconnect() {}
		},
	});
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
	let top = 0;
	const element = Object.assign(new EventTarget(), { clientHeight: 200 });
	Object.defineProperty(element, "scrollTop", {
		get: () => top,
		set: (next: number) => {
			top = Math.min(next, 3_000);
		},
	});
	const viewport = { current: element as unknown as HTMLElement };
	const sizes = Array.from({ length: 100 }, () => 32);
	let rows: ReturnType<typeof useVirtualRows>;
	function Probe() {
		rows = useVirtualRows(viewport, sizes, 0);
		return null;
	}
	const root = createRoot();
	try {
		await act(async () => root.render(<Probe />));
		await act(async () => rows.scrollToIndex(99));
		expect(top).toBe(3_000);
		expect(rows!.start).toBe(93);
		expect(rows!.end).toBe(100);
		await act(async () => rows.scrollToIndex(99));
		expect(rows!.start).toBe(93);
	} finally {
		await act(async () => root.unmount());
		for (const [name, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		}
	}
});
