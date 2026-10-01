import type { UsageMergedWork, UsageMergedWorkInput } from "@trellis/api";
import type { Tx } from "../../../db/tx.ts";
import { readMergedWork } from "../../pullRequests.ts";
import { dayKey, rangeStart } from "../aggregate.ts";

export async function mergedWork(_ctx: unknown, tx: Tx, input: UsageMergedWorkInput): Promise<UsageMergedWork> {
	const end = new Date(input.computedAt);
	const start = new Date(rangeStart(input.days, end));
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const found = await readMergedWork(tx, { start, end, zone });
	const byDay = new Map(found.map((bucket) => [bucket.day, bucket]));
	const empty = () => ({ prs: 0, additions: 0, deletions: 0, missingAdditions: 0, missingDeletions: 0 });
	const buckets = Array.from({ length: input.days }, (_, index) => {
		const date = new Date(start);
		date.setDate(date.getDate() + index);
		const day = dayKey(date.getTime());
		return byDay.get(day) ?? { day, ...empty() };
	});
	const totals = empty();
	for (const bucket of buckets) {
		totals.prs += bucket.prs;
		totals.additions += bucket.additions;
		totals.deletions += bucket.deletions;
		totals.missingAdditions += bucket.missingAdditions;
		totals.missingDeletions += bucket.missingDeletions;
	}
	return { computedAt: input.computedAt, buckets, totals };
}
