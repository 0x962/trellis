// A process that exits right after its launch and is launched again on
// every beat of a controller writes a new record every few seconds. The
// count of retained exited records has a ceiling, so a restart loop cannot
// fill the disk. Age removes a record first, then the oldest exits leave
// until the count is at the ceiling, then the oldest exits leave until the
// bytes are under the budget.
//
// One attempt holds its terminal output and its provider event log. Those
// two files run from a few kilobytes to a hundred megabytes, so the count
// alone says nothing about the disk the store takes. The byte budget is the
// bound that holds whatever the sizes turn out to be.
export type RetainOptions = {
	// How long an exited record stays after its exit, in milliseconds.
	retentionMs: number;
	// The most exited records the store keeps.
	maxExitedRecords: number;
	// The most bytes the files of the exited records take together.
	maxExitedBytes: number;
	// The most idle conversations the store keeps for a resume. Such a record
	// has no age bound, because a person comes back to the conversation on
	// another day.
	maxResumableRecords: number;
};

export const defaultRetainOptions: RetainOptions = {
	retentionMs: 2 * 24 * 60 * 60 * 1000,
	maxExitedRecords: 200,
	maxExitedBytes: 256 * 1024 * 1024,
	maxResumableRecords: 20,
};

export type ExitedRecord<T> = { record: T; endedAt: number; bytes: number };

// Keeps the newest records whose running total stays inside the budget.
function overBudget<T>(retained: ExitedRecord<T>[], maxBytes: number): T[] {
	let total = 0;
	const removed: T[] = [];
	for (const entry of retained) {
		total += entry.bytes;
		if (total > maxBytes) removed.push(entry.record);
	}
	return removed;
}

// The exited records to remove now: the ones past the retention, then the
// oldest ones above the ceiling, then the oldest ones above the byte budget.
export function exitedRecordsToRemove<T>(exited: ExitedRecord<T>[], now: number, options: RetainOptions): T[] {
	const expired = exited.filter((entry) => now - entry.endedAt >= options.retentionMs);
	const retained = exited
		.filter((entry) => now - entry.endedAt < options.retentionMs)
		.sort((a, b) => b.endedAt - a.endedAt);
	const withinCount = retained.slice(0, options.maxExitedRecords);
	return [
		...expired.map((entry) => entry.record),
		...retained.slice(options.maxExitedRecords).map((entry) => entry.record),
		...overBudget(withinCount, options.maxExitedBytes),
	];
}

// The idle conversations to remove now: the oldest ones above the ceiling.
export function resumableRecordsToRemove<T>(resumable: ExitedRecord<T>[], options: RetainOptions): T[] {
	return resumable
		.sort((a, b) => b.endedAt - a.endedAt)
		.slice(options.maxResumableRecords)
		.map((entry) => entry.record);
}
