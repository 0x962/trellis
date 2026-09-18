import { expect, test } from "bun:test";
import type { BoxClock } from "./boxClocks.ts";
import { node } from "./testDoc.ts";
import { timeWarning } from "./timeWarning.ts";

const inner: BoxClock = { box: node("inner", "group", null, { minutes: 10 }), budgetMs: 600_000, deadlineAt: 600_000 };
const outer: BoxClock = { box: node("outer", "group", null, { minutes: 30 }), budgetMs: 1_800_000, deadlineAt: null };

test("no warning while more than half of the budget is left", () => {
	expect(timeWarning([inner, outer], {}, 299_000)).toBeNull();
});

test("the first warning at half, the second at a quarter, each once", () => {
	const half = timeWarning([inner, outer], {}, 300_000);
	expect(half).toEqual({
		count: 1,
		text: "Time check: group inner has about 5 min left of its 10 min limit. Trellis stops this process when the limit ends. Finish now and write your result.",
	});
	expect(timeWarning([inner, outer], { timeWarnings: 1 }, 301_000)).toBeNull();
	const quarter = timeWarning([inner, outer], { timeWarnings: 1 }, 450_000);
	expect(quarter?.count).toBe(2);
	expect(quarter?.text).toContain("has about 3 min left");
	expect(timeWarning([inner, outer], { timeWarnings: 2 }, 599_000)).toBeNull();
});

test("two marks passed at once give one message, and none after the deadline", () => {
	expect(timeWarning([inner], {}, 560_000)).toEqual({
		count: 2,
		text: "Time check: group inner has 40 s left of its 10 min limit. Trellis stops this process when the limit ends. Finish now and write your result.",
	});
	expect(timeWarning([inner], {}, 600_000)).toBeNull();
});

test("the clock that ends first sets the warning, and a clock that waits does not", () => {
	const late: BoxClock = { ...outer, deadlineAt: 2_000_000 };
	expect(timeWarning([late, inner], {}, 300_000)?.text).toContain("group inner");
	expect(timeWarning([outer], {}, 1_000_000)).toBeNull();
});
