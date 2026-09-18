import { expect, test } from "bun:test";
import { epicProgress, epicProgressLabel, epicSegments } from "./epicBar";

const counts = { total: 10, todo: 3, started: 2, review: 1, done: 3, canceled: 1 };

test("a canceled ticket leaves the denominator and is never done", () => {
	expect(epicProgress(counts)).toEqual({ done: 3, of: 9 });
	expect(epicProgressLabel(counts)).toBe("3/9");
});

test("an epic with no ticket is 0/0", () => {
	expect(epicProgressLabel({ total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 })).toBe("0/0");
});

test("the bar holds one segment per category, done first, canceled last", () => {
	const segments = epicSegments(counts);
	expect(segments.map((segment) => segment.key)).toEqual(["done", "review", "started", "todo", "canceled"]);
	expect(segments.reduce((sum, segment) => sum + segment.value, 0)).toBe(counts.total);
});

test("Todo draws in the faint neutral, and every other category keeps its tone", () => {
	const tones = Object.fromEntries(epicSegments(counts).map((segment) => [segment.key, segment.tone]));
	expect(tones).toEqual({ done: "success", review: "agent", started: "warning", todo: "faint", canceled: "danger" });
});
