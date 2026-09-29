import { describe, expect, test } from "bun:test";
import { usageChartFocusIndex, usageChartSelectKey } from "./usageChartFocusIndex";

describe("usageChartFocusIndex", () => {
	test("moves one day with the arrow keys", () => {
		expect(usageChartFocusIndex("ArrowLeft", 2, 5)).toBe(1);
		expect(usageChartFocusIndex("ArrowRight", 2, 5)).toBe(3);
	});

	test("stops at the range edges", () => {
		expect(usageChartFocusIndex("ArrowLeft", 0, 5)).toBe(0);
		expect(usageChartFocusIndex("ArrowRight", 4, 5)).toBe(4);
	});

	test("moves to the range edges with Home and End", () => {
		expect(usageChartFocusIndex("Home", 3, 5)).toBe(0);
		expect(usageChartFocusIndex("End", 1, 5)).toBe(4);
	});

	test("ignores other keys and an empty range", () => {
		expect(usageChartFocusIndex("Enter", 2, 5)).toBeNull();
		expect(usageChartFocusIndex("ArrowRight", 0, 0)).toBeNull();
	});
});

test("Enter and Space select a day", () => {
	expect(usageChartSelectKey("Enter")).toBe(true);
	expect(usageChartSelectKey(" ")).toBe(true);
	expect(usageChartSelectKey("ArrowRight")).toBe(false);
});
