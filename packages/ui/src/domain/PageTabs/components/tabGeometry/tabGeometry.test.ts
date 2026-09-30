import { expect, test } from "bun:test";
import { tabBoxes, tabDropIndex, tabStripWidth, visibleTabRange } from "./tabGeometry";

test("mixed widths start at the strip edge and retain one gap between tabs", () => {
	const boxes = tabBoxes([60, 240, 92]);
	expect(boxes).toEqual([
		{ left: 0, width: 60 },
		{ left: 64, width: 240 },
		{ left: 308, width: 92 },
	]);
	expect(tabStripWidth(boxes)).toBe(400);
	expect(tabStripWidth([])).toBe(0);
});

test("a drop follows the midpoint of each tab, including a wide tab after a short one", () => {
	const boxes = tabBoxes([60, 240, 92]);
	expect([-20, 29, 30, 100, 183, 184, 353, 354, 500].map((offset) => tabDropIndex(boxes, offset))).toEqual([
		0, 0, 1, 1, 1, 2, 2, 3, 3,
	]);
	expect(tabDropIndex([], 0)).toBe(0);
});

test("the visible range follows variable widths at the start, middle, and end", () => {
	const boxes = tabBoxes([60, 240, 92, 72, 200, 80, 240, 64, 100]);
	expect(visibleTabRange(boxes, 0, 100)).toEqual({ start: 0, end: 4 });
	expect(visibleTabRange(boxes, 410, 290)).toEqual({ start: 1, end: 8 });
	expect(visibleTabRange(boxes, 1130, 100)).toEqual({ start: 6, end: 9 });
	expect(visibleTabRange([], 0, 100)).toEqual({ start: 0, end: 0 });
});
