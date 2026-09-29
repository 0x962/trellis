import { expect, test } from "bun:test";
import { tableRange } from "./useTableVirtualizer";

test("tableRange keeps drawn headers and the active group header", () => {
	const headerIndexes = Array.from({ length: 10_000 }, (_value, index) => index * 100);
	const drawnIndexes = Array.from({ length: 10 }, (_value, index) => 509_501 + index);

	expect(tableRange(drawnIndexes, headerIndexes, 509_505)).toEqual([509_500, ...drawnIndexes]);
});

test("tableRange does not repeat an active header that is already drawn", () => {
	expect(tableRange([98, 99, 100, 101, 102], [0, 100, 200], 101)).toEqual([98, 99, 100, 101, 102]);
});
