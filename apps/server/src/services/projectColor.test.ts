import { expect, test } from "bun:test";
import { freeColors, pickColor } from "./projectColor.ts";

// The rule that gives a project its color, without a database.

test("the free colors are the five names that no active project holds", () => {
	expect(freeColors([])).toEqual(["orange", "teal", "blue", "pink", "azure"]);
	expect(freeColors(["teal", "pink"])).toEqual(["orange", "blue", "azure"]);
	expect(freeColors([null, null])).toEqual(["orange", "teal", "blue", "pink", "azure"]);
});

test("the pick lands on the free color that the draw names", () => {
	expect(pickColor(["orange", "teal"], () => 0)).toBe("blue");
	expect(pickColor(["orange", "teal"], () => 0.99)).toBe("azure");
	expect(pickColor(["orange", "teal", "blue", "azure"], () => 0.5)).toBe("pink");
});

test("a full set of slots gives no color", () => {
	expect(pickColor(["orange", "teal", "blue", "pink", "azure"])).toBeNull();
});

test("the pick reads no order off the list", () => {
	const drawn = new Set<string | null>();
	for (let i = 0; i < 40; i += 1) drawn.add(pickColor([]));
	expect(drawn.size).toBeGreaterThan(1);
});
