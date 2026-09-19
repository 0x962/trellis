import { describe, expect, test } from "bun:test";
import { BATCH_LIMIT, batchesOf } from "./batches";

describe("batchesOf", () => {
	test("keeps one run under the limit", () => {
		expect(batchesOf([1, 2, 3])).toEqual([[1, 2, 3]]);
	});

	test("splits 2000 refs into 10 runs of 200", () => {
		const refs = Array.from({ length: 2000 }, (_value, index) => index);

		const runs = batchesOf(refs);

		expect(runs.length).toBe(10);
		expect(runs.every((run) => run.length === BATCH_LIMIT)).toBe(true);
		expect(runs.flat()).toEqual(refs);
	});

	test("the last run holds the remainder", () => {
		expect(batchesOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	test("no item makes no run", () => {
		expect(batchesOf([])).toEqual([]);
	});
});
