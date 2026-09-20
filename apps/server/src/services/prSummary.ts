import {
	PullRequestIdInputSchema,
	type PullRequestSummary,
	PullRequestSummaryWriteInputSchema,
	steCheck,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { invalidIssues } from "../errors.ts";
import { findPullRequestRow } from "./findPullRequestRow.ts";
import type { ServiceCtx } from "./support.ts";

const summaryColumns = sql`
	pull_request_id AS "pullRequestId", head_sha AS "headSha", headline, why, watch
`;

export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestSummary | null> => {
	const input = PullRequestIdInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const [summary] = await rows<PullRequestSummary>(
		tx,
		sql`SELECT ${summaryColumns} FROM pr_summaries
			WHERE pull_request_id = ${pullRequest.id}
			ORDER BY updated_at DESC, head_sha DESC LIMIT 1`,
	);
	return summary ?? null;
};

export const write = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestSummary> => {
	const input = PullRequestSummaryWriteInputSchema.parse(rawInput);
	const checks = [
		{ field: "headline", result: steCheck(input.headline, { headline: true }) },
		{ field: "why", result: steCheck(input.why, { headline: false }) },
		{ field: "watch", result: steCheck(input.watch, { headline: false }) },
	] as const;
	const issues = checks.flatMap(({ field, result }) => result.refusals.map((message) => ({ message, path: [field] })));
	if (issues.length > 0) throw invalidIssues(issues);

	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	const [summary] = await rows<PullRequestSummary>(
		tx,
		sql`INSERT INTO pr_summaries
			(pull_request_id, head_sha, headline, why, watch, created_at, updated_at)
			VALUES (${pullRequest.id}, ${input.headSha}, ${input.headline}, ${input.why}, ${input.watch}, ${at}, ${at})
			ON CONFLICT (pull_request_id, head_sha) DO UPDATE SET
				headline = EXCLUDED.headline, why = EXCLUDED.why, watch = EXCLUDED.watch,
				updated_at = EXCLUDED.updated_at
			RETURNING ${summaryColumns}`,
	);
	return summary!;
};
