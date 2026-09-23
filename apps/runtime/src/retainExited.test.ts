import { expect, test } from "bun:test";
import { exitedRecordsToRemove, type RetainOptions, resumableRecordsToRemove } from "./retainExited.ts";

const minute = 60_000;
const now = Date.parse("2026-09-17T12:00:00.000Z");
const at = (minutesAgo: number) => now - minutesAgo * minute;
const options = (overrides: Partial<RetainOptions>): RetainOptions => ({
	retentionMs: 60 * minute,
	maxExitedRecords: 10,
	maxExitedBytes: Number.MAX_SAFE_INTEGER,
	maxResumableRecords: 10,
	...overrides,
});

test("a record past the retention leaves, whatever the count", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "old", endedAt: at(11), bytes: 1 },
			{ record: "fresh", endedAt: at(1), bytes: 1 },
		],
		now,
		options({ retentionMs: 10 * minute }),
	);
	expect(removed).toEqual(["old"]);
});

test("the oldest exits above the ceiling leave", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "third", endedAt: at(3), bytes: 1 },
			{ record: "first", endedAt: at(1), bytes: 1 },
			{ record: "fifth", endedAt: at(5), bytes: 1 },
			{ record: "second", endedAt: at(2), bytes: 1 },
			{ record: "fourth", endedAt: at(4), bytes: 1 },
		],
		now,
		options({ maxExitedRecords: 2 }),
	);
	expect(removed).toEqual(["third", "fourth", "fifth"]);
});

test("a count at the ceiling keeps every record", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "a", endedAt: at(1), bytes: 1 },
			{ record: "b", endedAt: at(2), bytes: 1 },
		],
		now,
		options({ maxExitedRecords: 2 }),
	);
	expect(removed).toEqual([]);
});

test("the oldest exits leave until the bytes are inside the budget", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "small", endedAt: at(3), bytes: 10 },
			{ record: "huge", endedAt: at(1), bytes: 900 },
			{ record: "medium", endedAt: at(2), bytes: 200 },
		],
		now,
		options({ maxExitedBytes: 1000 }),
	);
	// The newest record fills 900 of the budget, so neither of the older two fits.
	expect(removed).toEqual(["medium", "small"]);
});

test("one record larger than the whole budget still leaves", () => {
	const removed = exitedRecordsToRemove(
		[{ record: "huge", endedAt: at(1), bytes: 5000 }],
		now,
		options({ maxExitedBytes: 1000 }),
	);
	expect(removed).toEqual(["huge"]);
});

test("the oldest idle conversations above the ceiling leave", () => {
	const removed = resumableRecordsToRemove(
		[
			{ record: "older", endedAt: at(9), bytes: 1 },
			{ record: "newer", endedAt: at(1), bytes: 1 },
			{ record: "oldest", endedAt: at(20), bytes: 1 },
		],
		options({ maxResumableRecords: 2 }),
	);
	expect(removed).toEqual(["oldest"]);
});
