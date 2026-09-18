import { expect, test } from "bun:test";
import { exitedRecordsToRemove } from "./retainExited.ts";

const minute = 60_000;
const now = Date.parse("2026-09-17T12:00:00.000Z");
const at = (minutesAgo: number) => now - minutesAgo * minute;

test("a record past the retention leaves, whatever the count", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "old", endedAt: at(11) },
			{ record: "fresh", endedAt: at(1) },
		],
		now,
		{ retentionMs: 10 * minute, maxExitedRecords: 10 },
	);
	expect(removed).toEqual(["old"]);
});

test("the oldest exits above the ceiling leave", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "third", endedAt: at(3) },
			{ record: "first", endedAt: at(1) },
			{ record: "fifth", endedAt: at(5) },
			{ record: "second", endedAt: at(2) },
			{ record: "fourth", endedAt: at(4) },
		],
		now,
		{ retentionMs: 60 * minute, maxExitedRecords: 2 },
	);
	expect(removed).toEqual(["third", "fourth", "fifth"]);
});

test("a count at the ceiling keeps every record", () => {
	const removed = exitedRecordsToRemove(
		[
			{ record: "a", endedAt: at(1) },
			{ record: "b", endedAt: at(2) },
		],
		now,
		{ retentionMs: 60 * minute, maxExitedRecords: 2 },
	);
	expect(removed).toEqual([]);
});
