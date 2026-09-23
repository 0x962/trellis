import { expect, test } from "bun:test";
import { windowLine } from "./windowLine";

test("names the count of the window and the day the oldest merged", () => {
	expect(windowLine({ merged: 30, oldestMergedAt: "2026-09-12T09:00:00.000Z" })).toBe(
		"The window is the last 30 merged pull requests, not a calendar week. The oldest of them merged on Sep 12.",
	);
});

test("names the count the database holds while it holds fewer", () => {
	expect(windowLine({ merged: 7, oldestMergedAt: "2026-09-12T09:00:00.000Z" })).toContain("the last 7 merged");
});

test("says that no pull request has merged yet", () => {
	expect(windowLine({ merged: 0, oldestMergedAt: null })).toBe(
		"No pull request has merged yet, so this block holds no figure.",
	);
});
