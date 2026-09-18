import { expect, test } from "bun:test";
import type { BoxClock } from "./boxClocks.ts";
import { node } from "./testDoc.ts";
import { timeLimitNotice } from "./timeLimitNotice.ts";

const inner: BoxClock = { box: node("inner", "group", null, { minutes: 2 }), budgetMs: 120_000, deadlineAt: null };
const outer: BoxClock = {
	box: node("outer", "group", null, { minutes: 30 }),
	budgetMs: 1_800_000,
	deadlineAt: 1_817_000,
};

test("names a clock that starts with the process and a clock that runs", () => {
	expect(timeLimitNotice([inner, outer], 617_000)).toBe(
		"Time limit: Group inner allows 2 min, counted from the start of this process. Group outer has about 20 min left of its 30 min limit. Trellis stops this process when the limit ends. Finish and write your result before then. You get a message when half of the time is left, and again when a quarter is left.",
	);
});

test("says nothing when no box around the step has a limit", () => {
	expect(timeLimitNotice([], 0)).toBeNull();
});
