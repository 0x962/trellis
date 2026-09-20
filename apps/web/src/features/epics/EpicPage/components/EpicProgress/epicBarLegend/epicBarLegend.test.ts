import { expect, test } from "bun:test";
import { epicSegments } from "../../../../epicBar";
import { epicBarLegend } from "./epicBarLegend";

const counts = { total: 30, todo: 15, started: 2, review: 9, done: 3, canceled: 1 };

test("the legend names each category in lower case with its count", () => {
	expect(epicBarLegend(counts)).toBe("done 3 · review 9 · started 2 · todo 15 · canceled 1");
});

test("a category at zero keeps its word", () => {
	expect(epicBarLegend({ total: 3, todo: 3, started: 0, review: 0, done: 0, canceled: 0 })).toBe(
		"done 0 · review 0 · started 0 · todo 3 · canceled 0",
	);
});

test("an epic with no ticket prints every word at zero", () => {
	expect(epicBarLegend({ total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 })).toBe(
		"done 0 · review 0 · started 0 · todo 0 · canceled 0",
	);
});

test("the legend holds one word per segment of the bar", () => {
	expect(epicBarLegend(counts).split(" · ")).toHaveLength(epicSegments(counts).length);
});
