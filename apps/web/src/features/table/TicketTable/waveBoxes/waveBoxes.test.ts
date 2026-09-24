import { describe, expect, test } from "bun:test";
import type { VirtualItem } from "@tanstack/react-virtual";
import { waveBoxes } from "./waveBoxes";

// The lines of a list, in order, with the height each one takes. The test
// reads the offsets the same way the virtualizer reports them.
const lines = (heights: readonly number[]): VirtualItem[] => {
	let start = 0;
	return heights.map((size, index) => {
		const line = { index, key: index, start, end: start + size, size, lane: 0 };
		start += size;
		return line;
	});
};

const totalOf = (heights: readonly number[]) => heights.reduce((sum, size) => sum + size, 0);

describe("waveBoxes", () => {
	test("gives each header the room from its own line to the next header line", () => {
		const heights = [44, 36, 36, 44, 36];

		const boxes = waveBoxes([0, 3], lines(heights), totalOf(heights));

		expect(boxes.get(0)).toEqual({ top: 0, height: 116 });
		expect(boxes.get(3)).toEqual({ top: 116, height: 80 });
	});

	test("runs the last header to the end of the list", () => {
		const heights = [44, 36, 44, 36, 36];

		const boxes = waveBoxes([0, 2], lines(heights), totalOf(heights));

		expect(boxes.get(2)).toEqual({ top: 80, height: 116 });
	});

	test("counts the height that a wrapped agent line took", () => {
		const heights = [44, 36, 72, 44, 36];

		const boxes = waveBoxes([0, 3], lines(heights), totalOf(heights));

		expect(boxes.get(0)!.height).toBe(152);
		expect(boxes.get(3)!.top).toBe(152);
	});

	test("gives a header with no line under it the height of its own line", () => {
		const heights = [44, 44, 36];

		const boxes = waveBoxes([0, 1], lines(heights), totalOf(heights));

		expect(boxes.get(0)).toEqual({ top: 0, height: 44 });
	});

	test("gives no box for a header line the list has not measured", () => {
		const boxes = waveBoxes([0, 4], lines([44, 36]), 80);

		expect(boxes.has(4)).toBe(false);
		expect(boxes.get(0)).toEqual({ top: 0, height: 80 });
	});
});
