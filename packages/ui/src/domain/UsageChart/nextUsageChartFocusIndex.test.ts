import { describe, expect, test } from "bun:test";
import { isUsageChartSelectKey, nextUsageChartFocusIndex } from "./nextUsageChartFocusIndex";

describe("nextUsageChartFocusIndex", () => {
	test("moves one day with the arrow keys", () => {
		expect(nextUsageChartFocusIndex("ArrowLeft", 2, 5)).toBe(1);
		expect(nextUsageChartFocusIndex("ArrowRight", 2, 5)).toBe(3);
	});

	test("stops at the range edges", () => {
		expect(nextUsageChartFocusIndex("ArrowLeft", 0, 5)).toBe(0);
		expect(nextUsageChartFocusIndex("ArrowRight", 4, 5)).toBe(4);
	});

	test("moves to the range edges with Home and End", () => {
		expect(nextUsageChartFocusIndex("Home", 3, 5)).toBe(0);
		expect(nextUsageChartFocusIndex("End", 1, 5)).toBe(4);
	});

	test("ignores other keys and an empty range", () => {
		expect(nextUsageChartFocusIndex("Enter", 2, 5)).toBeNull();
		expect(nextUsageChartFocusIndex("ArrowRight", 0, 0)).toBeNull();
	});
});

test("Enter and Space select a day", () => {
	expect(isUsageChartSelectKey("Enter")).toBe(true);
	expect(isUsageChartSelectKey(" ")).toBe(true);
	expect(isUsageChartSelectKey("ArrowRight")).toBe(false);
});
