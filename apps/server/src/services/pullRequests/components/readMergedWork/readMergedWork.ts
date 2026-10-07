import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";

type MergedWorkBucket = {
	day: string;
	prs: number;
	additions: number;
	deletions: number;
	missingAdditions: number;
	missingDeletions: number;
};

export function readMergedWork(tx: Tx, input: { start: Date; end: Date; zone: string }): Promise<MergedWorkBucket[]> {
	const { start, end, zone } = input;
	return rows<MergedWorkBucket>(
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
}
