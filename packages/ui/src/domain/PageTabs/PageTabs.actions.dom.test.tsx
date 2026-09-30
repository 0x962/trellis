import { expect, test } from "bun:test";
import { act } from "react";
import { contextMenuFixture } from "./components/contextMenuFixture";

const domTest = test.skipIf(typeof document === "undefined");

domTest("the inactive target supplies pin, restore, sort, and close actions without page selection", async () => {
	const f = await contextMenuFixture();
	try {
		expect(f.container.querySelector('button[aria-label="Tab actions"]')).toBeNull();
		expect(f.container.querySelector('button[aria-label="Add tab"]')).not.toBeNull();
		await f.open("other");
		expect(f.tab("active").getAttribute("aria-selected")).toBe("true");
		await f.choose("Pin tab");
		expect(f.pinned).toEqual([["other", true]]);
		expect(f.tab("other").getAttribute("data-pinned")).toBe("true");
		expect(document.activeElement).toBe(f.tab("other"));
		await f.open("other");
		await f.choose("Unpin tab");
		expect(f.pinned).toEqual([
			["other", true],
			["other", false],
		]);
		await f.open("other");
		await f.choose("Restore page title");
		expect(f.renamed).toEqual([["other", null]]);
		await f.open("other");
		await f.choose("Sort tabs Z to A");
		expect(f.sorted).toEqual(["descending"]);
		await f.open("other");
		await f.choose("Close tab");
		expect(f.closed).toEqual(["other"]);
		expect(f.tab("other")).toBeNull();
		expect(document.activeElement).toBe(f.tab("active"));
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

domTest("pinned and grouped targets keep their own move bounds and group actions", async () => {
	const f = await contextMenuFixture({
		tabs: [
			{ id: "pin1", title: "First pin", pinned: true },
			{ id: "pin2", title: "Second pin", pinned: true },
			{ id: "group1", title: "First group tab", pinned: false, groupId: "g" },
			{ id: "group2", title: "Last group tab", pinned: false, groupId: "g" },
			{ id: "other-group", title: "Next group", pinned: false, groupId: "h" },
			{ id: "active", title: "Active page", pinned: false },
		],
		groups: [
			{ id: "g", name: "Work", collapsed: false },
			{ id: "h", name: "Later", collapsed: true },
		],
	});
	try {
		await act(async () => {
			const region = f.container.querySelector<HTMLElement>(".overflow-x-auto.min-w-0")!;
			region.scrollLeft = 0;
			region.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		await f.open("pin1");
		expect(f.item("Move tab left").hasAttribute("data-disabled")).toBe(true);
		expect(f.item("Move tab to start").hasAttribute("data-disabled")).toBe(true);
		expect(f.item("Move tab right").hasAttribute("data-disabled")).toBe(false);
		expect(f.item("Add tab to new group")).toBeUndefined();
		await f.choose("Move tab right");
		expect(f.moved).toEqual([["pin1", "group1"]]);
		await f.open("pin2");
		expect(f.item("Move tab right").hasAttribute("data-disabled")).toBe(true);
		await f.choose("Move tab to start");
		expect(f.moved.at(-1)).toEqual(["pin2", "pin1"]);
		await f.open("group1");
		expect(f.item("Move tab left").hasAttribute("data-disabled")).toBe(true);
		await f.choose("Move tab to end");
		expect(f.moved.at(-1)).toEqual(["group1", "other-group"]);
		await f.open("group2");
		expect(f.item("Move tab right").hasAttribute("data-disabled")).toBe(true);
		expect(f.item("Move tab to end").hasAttribute("data-disabled")).toBe(true);
		await f.key(f.menu(), "Escape");
		await f.open("group1");
		await f.choose("Remove tab from group");
		expect(f.grouped).toEqual([["group1", null]]);
		await f.open("group1");
		await f.choose("Move tab to a group…");
		const search = document.querySelector<HTMLInputElement>('[aria-label="Search groups"]')!;
		expect(document.activeElement).toBe(search);
		await f.key(search, "Enter");
		expect(f.grouped.at(-1)).toEqual(["group1", "h"]);
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

domTest("rename keeps the inactive field focused and returns focus after save and cancel", async () => {
	const f = await contextMenuFixture();
	try {
		await f.open("other");
		await f.choose("Rename tab");
		const input = f.container.querySelector<HTMLInputElement>('[aria-label="Tab name"]')!;
		expect(document.activeElement).toBe(input);
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Renamed page");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await f.key(input, "Enter");
		expect(f.renamed).toEqual([["other", "Renamed page"]]);
		expect(document.activeElement).toBe(f.tab("other"));
		await f.open("other");
		await f.choose("Rename tab");
		await f.key(f.container.querySelector('[aria-label="Tab name"]')!, "Escape");
		expect(f.renamed).toHaveLength(1);
		expect(document.activeElement).toBe(f.tab("other"));
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

domTest("a new group receives the inactive tab and focuses the group name", async () => {
	const f = await contextMenuFixture();
	try {
		await f.open("other");
		await f.choose("Add tab to new group");
		expect(f.created).toEqual([["New group", "other"]]);
		expect(document.activeElement).toBe(f.container.querySelector('[aria-label="Group name"]'));
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

domTest("the group menu and strip pickers remain available beside tab context menus", async () => {
	const f = await contextMenuFixture({
		tabs: [
			{ id: "other", title: "Other page", pinned: false, groupId: "g" },
			{ id: "active", title: "Active page", pinned: false },
		],
		groups: [{ id: "g", name: "Work", collapsed: false }],
	});
	try {
		await act(async () => f.container.querySelector<HTMLButtonElement>('[aria-label="Work actions"]')!.click());
		await f.settle();
		expect(document.querySelector('[role="menu"]')?.textContent).toContain("Ungroup tabs");
		await f.key(document.querySelector('[role="menu"]')!, "Escape");
		await f.open("other");
		expect(f.menu()).not.toBeNull();
		await f.key(f.menu(), "Escape");
		await act(async () =>
			f.container.querySelector<HTMLButtonElement>('[aria-label="Move tab to a group"]')!.click(),
		);
		await f.settle();
		await f.key(document.querySelector('[aria-label="Search groups"]')!, "Enter");
		expect(f.grouped).toEqual([["active", "g"]]);
	} finally {
		await f.close();
	}
});

domTest("one tab disables sort and both movement bounds", async () => {
	const f = await contextMenuFixture({ tabs: [{ id: "active", title: "Only page", pinned: false }] });
	try {
		await f.open("active");
		for (const label of ["Sort tabs A to Z", "Sort tabs Z to A", "Move tab left", "Move tab right"]) {
			expect(f.item(label).hasAttribute("data-disabled")).toBe(true);
			await act(async () => f.item(label).click());
		}
		expect(f.sorted).toEqual([]);
		expect(f.moved).toEqual([]);
		await f.choose("Close tab");
		expect(document.activeElement).toBe(f.container.querySelector('[aria-label="Add tab"]'));
	} finally {
		await f.close();
	}
});
