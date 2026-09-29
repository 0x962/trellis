import { expect, test } from "bun:test";
import { dropTargetId, slotIndexOf, tabSlots } from "./tabSlots";

const groups = [
	{ id: "g", name: "Reviews", collapsed: false },
	{ id: "h", name: "Later", collapsed: true },
];
const tabs = [
	{ id: "b", title: "B", groupId: "g" },
	{ id: "c", title: "C", groupId: "g" },
	{ id: "d", title: "D", groupId: "h" },
	{ id: "a", title: "A" },
];

test("a header precedes each block and a collapsed group hides its tabs", () => {
	const slots = tabSlots(tabs, groups);
	expect(slots.map((slot) => (slot.kind === "group" ? `[${slot.group.name}:${slot.count}]` : slot.tab.id))).toEqual([
		"[Reviews:2]",
		"b",
		"c",
		"[Later:1]",
		"a",
	]);
	expect(slotIndexOf(slots, "c")).toBe(2);
	expect(slotIndexOf(slots, "d")).toBe(-1);
});

test("a drop on a header lands before the first tab of the group", () => {
	const slots = tabSlots(tabs, groups);
	expect(dropTargetId(slots, 0)).toBe("b");
	expect(dropTargetId(slots, 3)).toBe("a");
	expect(dropTargetId(slots, 5)).toBeNull();
});
