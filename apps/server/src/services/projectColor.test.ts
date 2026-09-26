import { expect, test } from "bun:test";
import { PROJECT_COLORS } from "../db/enums.ts";
import { freeColors, pickColor } from "./projectColor.ts";

// The rule that gives a project its color, without a database.

test("the free colors are the names that no active project holds", () => {
	expect(freeColors([])).toEqual([...PROJECT_COLORS]);
	expect(freeColors([null, null])).toEqual([...PROJECT_COLORS]);

	const free = freeColors(["teal", "pink"]);

	expect(free).not.toContain("teal");
	expect(free).not.toContain("pink");
	expect(free).toHaveLength(PROJECT_COLORS.length - 2);
});

test("the pick lands on the free color that the draw names", () => {
	const free = freeColors(["orange", "teal"]);

	expect(pickColor(["orange", "teal"], () => 0)).toBe(free[0]!);
	expect(pickColor(["orange", "teal"], () => 0.99)).toBe(free.at(-1)!);
	expect(pickColor(["orange", "teal"], () => 0.5)).toBe(free[Math.floor(0.5 * free.length)]!);
});

test("a full set of slots gives no color", () => {
	expect(pickColor(PROJECT_COLORS)).toBeNull();
});

// A person who makes 8 projects fills every slot, and the 9th holds none.
test("the names run out after 8 projects", () => {
	expect(PROJECT_COLORS).toHaveLength(8);
	expect(freeColors(PROJECT_COLORS)).toEqual([]);
});

test("the pick reads no order off the list", () => {
	const drawn = new Set<string | null>();
	for (let i = 0; i < 40; i += 1) drawn.add(pickColor([]));
	expect(drawn.size).toBeGreaterThan(1);
});
