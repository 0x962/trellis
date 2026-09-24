import { describe, expect, test } from "bun:test";
import type { KeyboardEvent } from "react";
import { isCheckableItem, itemForKey, type MenuGroup, type MenuItem, menuGroups } from "./menuRows";

const item = (label: string, rest: Partial<MenuItem> = {}): MenuItem => ({ label, onSelect: () => {}, ...rest });

const press = (key: string, modifier?: "altKey" | "ctrlKey" | "metaKey" | "shiftKey") =>
	({
		key,
		altKey: modifier === "altKey",
		ctrlKey: modifier === "ctrlKey",
		metaKey: modifier === "metaKey",
		shiftKey: modifier === "shiftKey",
	}) as KeyboardEvent;

describe("menuGroups", () => {
	test("wraps a flat list of items in one group", () => {
		const groups = menuGroups([item("Rename"), item("Delete")]);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.items.map((row) => row.label)).toEqual(["Rename", "Delete"]);
	});

	test("keeps the caller's own groups and drops a group that holds no item", () => {
		const full: MenuGroup = { type: "group", label: "Ticket", items: [item("Rename")] };
		const empty: MenuGroup = { type: "group", label: "Agent", items: [] };
		expect(menuGroups([full, empty]).map((group) => group.label)).toEqual(["Ticket"]);
	});
});

describe("isCheckableItem", () => {
	test("an item that carries a state draws as a checkbox item, true or false", () => {
		expect(isCheckableItem(item("Sessions", { checked: true }))).toBe(true);
		expect(isCheckableItem(item("Epics", { checked: false }))).toBe(true);
	});

	test("an item that runs an action stays a plain item", () => {
		expect(isCheckableItem(item("Rename"))).toBe(false);
		expect(isCheckableItem(item("Delete", { danger: true, kbd: "3" }))).toBe(false);
	});
});

describe("itemForKey", () => {
	const groups = menuGroups([
		item("Rename", { kbd: "1" }),
		item("Sessions", { checked: true, kbd: "2" }),
		item("Move", { kbd: "3", disabled: true }),
		item("Delete", { kbd: "Shift+3" }),
	]);

	test("runs the item of a one character key", () => {
		expect(itemForKey(groups, press("1"))?.label).toBe("Rename");
	});

	test("runs a row that carries a state, as it runs a plain row", () => {
		expect(itemForKey(groups, press("2"))?.label).toBe("Sessions");
	});

	test("leaves a disabled item alone", () => {
		expect(itemForKey(groups, press("3"))).toBeUndefined();
	});

	test("leaves a press that carries a modifier to the browser", () => {
		expect(itemForKey(groups, press("1", "metaKey"))).toBeUndefined();
		expect(itemForKey(groups, press("1", "shiftKey"))).toBeUndefined();
	});

	test("matches the key of the item in either case", () => {
		const letters = menuGroups([item("Approve", { kbd: "A" })]);
		expect(itemForKey(letters, press("a"))?.label).toBe("Approve");
	});
});
