// The server takes at most this many ticket refs in one `updateMany` or
// `deleteMany` call (`TicketBatchSchema` in `@trellis/api`).
export const BATCH_LIMIT = 200;

// Splits refs into runs of at most `BATCH_LIMIT`, in order. A selection of
// 2000 rows becomes 10 calls; each call is one server transaction.
export const batchesOf = <T>(items: readonly T[], size = BATCH_LIMIT): T[][] => {
	const runs: T[][] = [];
	for (let start = 0; start < items.length; start += size) runs.push(items.slice(start, start + size));
	return runs;
};
