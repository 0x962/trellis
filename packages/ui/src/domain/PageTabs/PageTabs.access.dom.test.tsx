import { expect, test } from "bun:test";
import { act } from "react";
import { contextMenuFixture } from "./components/contextMenuFixture";

const domTest = test.skipIf(typeof document === "undefined");

domTest("the tablist owns only mounted tabs and leaves actions outside its ownership", async () => {
	const f = await contextMenuFixture({
		tabs: Array.from({ length: 100 }, (_, i) => ({ id: `tab ${i}`, title: `Page ${i}`, pinned: false })),
		activeId: "tab 0",
	});
	try {
		const assertOwned = () => {
			const list = f.container.querySelector('[role="tablist"]')!;
			const ids = list.getAttribute("aria-owns")!.split(" ");
			const mounted = [...f.container.querySelectorAll('[role="tab"]')];
			expect(ids).toEqual(mounted.map((tab) => tab.id));
			expect(ids.every((id) => document.getElementById(id)?.getAttribute("role") === "tab")).toBe(true);
			expect(list.querySelector("button")).toBeNull();
			expect(mounted.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
			return ids;
		};
		const first = assertOwned();
		await act(async () => {
			const region = f.tab("tab 0").closest<HTMLElement>(".overflow-x-auto")!;
			region.scrollLeft = 8000;
			region.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		expect(assertOwned()).not.toEqual(first);
	} finally {
		await f.close();
	}
});

domTest("arrows and edge keys focus tabs across virtual regions and skip collapsed groups", async () => {
	const f = await contextMenuFixture({
		tabs: [
			{ id: "pin", title: "Pinned page", pinned: true },
			{ id: "hidden", title: "Hidden page", pinned: false, groupId: "g" },
			...Array.from({ length: 100 }, (_, i) => ({ id: `tab-${i}`, title: `Page ${i}`, pinned: false })),
		],
		groups: [{ id: "g", name: "Later", collapsed: true }],
		activeId: "tab-0",
	});
	try {
		await act(async () => f.tab("tab-0").focus());
		for (const [key, id] of [
			["ArrowLeft", "pin"],
			["ArrowRight", "tab-0"],
			["End", "tab-99"],
			["ArrowRight", "pin"],
			["Home", "pin"],
		] as const) {
			await f.key(document.activeElement!, key);
			expect(document.activeElement).toBe(f.tab(id));
			expect(f.tab(id).getAttribute("aria-selected")).toBe("true");
		}
		await f.key(f.tab("pin"), "End");
		await f.key(f.tab("tab-99"), "Delete");
		expect(document.activeElement).toBe(f.tab("pin"));
		expect(f.closed).toEqual(["tab-99"]);
		expect(f.selected).not.toContain("hidden");
	} finally {
		await f.close();
	}
});

domTest("the close action does not change pages with arrow keys", async () => {
	const f = await contextMenuFixture();
	try {
		const close = f.container.querySelector<HTMLButtonElement>('[aria-label="Close Active page"]')!;
		await act(async () => close.focus());
		await f.key(close, "ArrowRight");
		expect(f.selected).toEqual([]);
		expect(document.activeElement).toBe(close);
		const keys: string[] = [];
		f.container.addEventListener("keydown", (event) => keys.push(event.key));
		await f.key(close, "w", { metaKey: true });
		expect(keys).toEqual(["w"]);
	} finally {
		await f.close();
	}
});

domTest("both context-menu keys open on the focused inactive tab and Escape returns focus", async () => {
	const f = await contextMenuFixture();
	try {
		for (const key of ["ContextMenu", "F10"]) {
			await act(async () => f.tab("other").focus());
			await f.key(f.tab("other"), key, { shiftKey: key === "F10" });
			expect(f.menu()).not.toBeNull();
			expect(f.menu().contains(document.activeElement)).toBe(true);
			await f.key(document.activeElement!, "ArrowDown");
			expect(f.menu().contains(document.activeElement)).toBe(true);
			await f.key(document.activeElement!, "ArrowRight");
			expect(f.selected).toEqual([]);
			await f.key(document.activeElement!, "Escape");
			expect(f.menu()).toBeNull();
			expect(document.activeElement).toBe(f.tab("other"));
			expect(f.tab("active").getAttribute("aria-selected")).toBe("true");
		}
		await f.key(f.tab("other"), "ArrowLeft", { altKey: true, shiftKey: true });
		expect(f.moved).toEqual([["other", "active"]]);
		await f.key(f.tab("other"), "Delete");
		expect(f.closed).toEqual(["other"]);
		expect(document.activeElement).toBe(f.tab("active"));
	} finally {
		await f.close();
	}
});

domTest("normal selection and middle-click closure keep their existing behavior", async () => {
	const f = await contextMenuFixture({
		tabs: [
			{ id: "pin", title: "Pinned page", pinned: true },
			{ id: "active", title: "Active page", pinned: false },
			{ id: "other", title: "Other page", pinned: false },
		],
	});
	try {
		await act(async () => f.tab("other").click());
		expect(f.selected).toEqual(["other"]);
		await act(async () =>
			f.tab("pin").dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true })),
		);
		expect(f.closed).toEqual([]);
		await act(async () =>
			f.tab("other").dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true })),
		);
		expect(f.closed).toEqual(["other"]);
	} finally {
		await f.close();
	}
});

domTest("right-click opens the menu without dragging and a primary drag still reorders", async () => {
	const f = await contextMenuFixture();
	try {
		const tab = f.tab("active");
		const capture: number[] = [];
		tab.setPointerCapture = (id) => {
			capture.push(id);
		};
		const pointer = (type: string, button: number, clientX: number) =>
			act(async () => {
				tab.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						cancelable: true,
						pointerId: 1,
						pointerType: "mouse",
						button,
						clientX,
					}),
				);
			});
		await pointer("pointerdown", 2, 20);
		await f.open("active");
		expect(capture).toEqual([]);
		expect(f.moved).toEqual([]);
		await f.key(f.menu(), "Escape");
		await pointer("pointerdown", 0, 20);
		await pointer("pointermove", 0, 400);
		await pointer("pointerup", 0, 400);
		await act(async () => tab.click());
		expect(capture).toEqual([1]);
		expect(f.moved).toEqual([["active", null]]);
		expect(f.selected).toEqual([]);
		expect(f.menu()).toBeNull();
	} finally {
		await f.close();
	}
});

domTest("a touch long press opens the target menu and consumes its trailing click", async () => {
	const f = await contextMenuFixture();
	try {
		const tab = f.tab("other");
		await act(async () => {
			const start = new Event("touchstart", { bubbles: true, cancelable: true });
			Object.defineProperty(start, "touches", { value: [{ clientX: 20, clientY: 20 }] });
			tab.dispatchEvent(start);
			await new Promise((resolve) => setTimeout(resolve, 550));
		});
		await f.settle();
		expect(f.menu()).not.toBeNull();
		await act(async () => {
			tab.dispatchEvent(new Event("touchend", { bubbles: true }));
			tab.click();
		});
		expect(f.selected).toEqual([]);
		await f.key(f.menu(), "Escape");
		expect(document.activeElement).toBe(f.tab("other"));
	} finally {
		await f.close();
	}
});

domTest("touch movement cancels the long press before the menu opens", async () => {
	const f = await contextMenuFixture();
	try {
		await act(async () => {
			for (const [type, x] of [
				["touchstart", 20],
				["touchmove", 80],
			] as const) {
				const event = new Event(type, { bubbles: true, cancelable: true });
				Object.defineProperty(event, "touches", { value: [{ clientX: x, clientY: 20 }] });
				f.tab("other").dispatchEvent(event);
			}
			await new Promise((resolve) => setTimeout(resolve, 550));
		});
		expect(f.menu()).toBeNull();
		expect(f.selected).toEqual([]);
		expect(f.moved).toEqual([]);
	} finally {
		await f.close();
	}
});

domTest("a long press over the close icon keeps the tab open", async () => {
	const f = await contextMenuFixture();
	try {
		const close = f.container.querySelector<HTMLButtonElement>('[aria-label="Close Other page"]')!;
		await act(async () => {
			const start = new Event("touchstart", { bubbles: true, cancelable: true });
			Object.defineProperty(start, "touches", { value: [{ clientX: 20, clientY: 20 }] });
			close.dispatchEvent(start);
			await new Promise((resolve) => setTimeout(resolve, 550));
		});
		await f.settle();
		expect(f.menu()).not.toBeNull();
		await act(async () => {
			close.dispatchEvent(new Event("touchend", { bubbles: true }));
			close.click();
		});
		expect(f.closed).toEqual([]);
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

for (const pinned of [false, true]) {
	domTest(
		`a ${pinned ? "pinned" : "regular"} menu target stays mounted through scrolling and focus return`,
		async () => {
			const f = await contextMenuFixture({
				tabs: Array.from({ length: 1_000 }, (_, index) => ({ id: `tab-${index}`, title: `Page ${index}`, pinned })),
				activeId: "tab-0",
			});
			try {
				await f.open("tab-1");
				const target = f.tab("tab-1");
				const region = target.closest<HTMLElement>(".overflow-x-auto")!;
				await act(async () => {
					region.scrollLeft = 50_000;
					region.dispatchEvent(new Event("scroll", { bubbles: true }));
				});
				expect(f.tab("tab-1")).toBe(target);
				expect(f.menu()).not.toBeNull();
				expect(f.container.querySelectorAll('[role="tab"]').length).toBeLessThan(15);
				await f.key(f.menu(), "Escape");
				expect(document.activeElement).toBe(target);
				expect(f.selected).toEqual([]);
				await act(async () => f.tab("tab-0").focus());
				expect(f.tab("tab-1")).toBeNull();
			} finally {
				await f.close();
			}
		},
	);
}
