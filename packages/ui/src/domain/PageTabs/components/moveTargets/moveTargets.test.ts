import { expect, test } from "bun:test";
import { moveTargetForKey } from "./moveTargets";

const tabs = [
	{ id: "p", title: "P", pinned: true },
	{ id: "b", title: "B", pinned: false, groupId: "g" },
	{ id: "c", title: "C", pinned: false, groupId: "g" },
	{ id: "a", title: "A", pinned: false },
];

test("a keyboard move stays inside the region of the active tab", () => {
	expect(moveTargetForKey("ArrowLeft", tabs, 1, 1, 2)).toBeUndefined();
	expect(moveTargetForKey("ArrowRight", tabs, 1, 1, 2)).toBe("a");
	expect(moveTargetForKey("End", tabs, 1, 1, 2)).toBe("a");
	expect(moveTargetForKey("Home", tabs, 2, 1, 2)).toBe("b");
	expect(moveTargetForKey("ArrowRight", tabs, 2, 1, 2)).toBeUndefined();
	expect(moveTargetForKey("End", tabs, 3, 3, 3)).toBeUndefined();
	expect(moveTargetForKey("Tab", tabs, 1, 1, 2)).toBeUndefined();
});
