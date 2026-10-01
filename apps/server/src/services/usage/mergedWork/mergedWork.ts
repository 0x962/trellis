import type { UsageMergedWork, UsageMergedWorkInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { dayKey, rangeStart } from "../aggregate.ts";

export async function mergedWork(_ctx: unknown, tx: Tx, input: UsageMergedWorkInput): Promise<UsageMergedWork> {
	const end = new Date(input.computedAt);
	const start = new Date(rangeStart(input.days, end));
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const found = await rows<UsageMergedWork["buckets"][number]>(
		tx,
		sql`
		SELECT timezone(${zone}, pr.merged_at)::date::text AS day,
			count(*)::int AS prs,
			coalesce(sum(pr.additions), 0)::float8 AS additions,
			coalesce(sum(pr.deletions), 0)::float8 AS deletions,
			count(*) FILTER (WHERE pr.additions IS NULL)::int AS "missingAdditions",
			count(*) FILTER (WHERE pr.deletions IS NULL)::int AS "missingDeletions"
		FROM pull_requests pr
		WHERE pr.state = 'merged' AND pr.merged_at >= ${start} AND pr.merged_at <= ${end}
			AND EXISTS (SELECT 1 FROM ticket_pull_requests link WHERE link.pull_request_id = pr.id)
		GROUP BY 1 ORDER BY 1
	`,
	);
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
