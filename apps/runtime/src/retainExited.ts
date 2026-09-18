// A process that exits right after its launch and is launched again on
// every beat of a controller writes a new record every few seconds. The
// count of retained exited records has a ceiling, so a restart loop cannot
// fill the disk. Age removes a record first; then the oldest exits leave
// until the count is at the ceiling.
export type RetainOptions = {
	// How long an exited record stays after its exit, in milliseconds.
	retentionMs: number;
	// The most exited records the store keeps.
	maxExitedRecords: number;
};

export const defaultRetainOptions: RetainOptions = {
	retentionMs: 7 * 24 * 60 * 60 * 1000,
	maxExitedRecords: 500,
};

export type ExitedRecord<T> = { record: T; endedAt: number };

// The exited records to remove now: the ones past the retention, then the
// oldest ones above the ceiling.
export function exitedRecordsToRemove<T>(exited: ExitedRecord<T>[], now: number, options: RetainOptions): T[] {
	const expired = exited.filter((entry) => now - entry.endedAt >= options.retentionMs);
	const retained = exited
		.filter((entry) => now - entry.endedAt < options.retentionMs)
		.sort((a, b) => b.endedAt - a.endedAt);
	return [...expired, ...retained.slice(options.maxExitedRecords)].map((entry) => entry.record);
}
