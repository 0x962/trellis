import {
	PullRequestIdInputSchema,
	type PullRequestSummary,
	PullRequestSummaryHeadInputSchema,
	PullRequestSummaryWriteInputSchema,
	type PullRequestSummaryWriteOutput,
	steCheck,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { invalidInput, invalidIssues } from "../errors.ts";
import { findPullRequestRow } from "./findPullRequestRow.ts";
import { parseGhJsonForService } from "./ghJson.ts";
import { announcePullRequestUpdate, setHeadSha } from "./pullRequests.ts";
import { fail, type PrepareCtx, type ServiceCtx } from "./support.ts";

const summaryColumns = sql`
	pull_request_id AS "pullRequestId", head_sha AS "headSha", headline, why, watch
`;

// created_at records when each head first received a summary. An update keeps
// that value, so a rewrite of an older head does not make it newest. The caller
// compares headSha with the current pull request head before it shows the text.
export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestSummary | null> => {
	const input = PullRequestIdInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const [summary] = await rows<PullRequestSummary>(
		tx,
		sql`SELECT ${summaryColumns} FROM pr_summaries
			WHERE pull_request_id = ${pullRequest.id}
			ORDER BY created_at DESC, head_sha DESC LIMIT 1`,
	);
	return summary ?? null;
};

export const readHead = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestSummary | null> => {
	const input = PullRequestSummaryHeadInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const [summary] = await rows<PullRequestSummary>(
		tx,
		sql`SELECT ${summaryColumns} FROM pr_summaries
			WHERE pull_request_id = ${pullRequest.id} AND head_sha = ${input.headSha}`,
	);
	return summary ?? null;
};

type WriteInput = ReturnType<typeof PullRequestSummaryWriteInputSchema.parse>;

export const prepareWrite = async (ctx: PrepareCtx, rawInput: unknown): Promise<WriteInput> => {
	const input = PullRequestSummaryWriteInputSchema.parse(rawInput);
	const pullRequest = await ctx.newTx((tx) => findPullRequestRow(tx, input.id));
	const args = ["pr", "view", pullRequest.url, "--json", "headRefOid"];
	const result = await ctx.gh("interactive", args);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const { headRefOid } = parseGhJsonForService<{ headRefOid: string }>(args, result);
	if (headRefOid !== input.headSha)
		throw invalidInput("headSha", "headSha does not match the current pull request head.");
	return input;
};

export const write = async (ctx: ServiceCtx, tx: Tx, input: WriteInput): Promise<PullRequestSummaryWriteOutput> => {
	const steResults = [
		{ field: "headline", result: steCheck(input.headline, { headline: true }) },
		{ field: "why", result: steCheck(input.why, { headline: false }) },
		{ field: "watch", result: steCheck(input.watch, { headline: false }) },
	] as const;
	const issues = steResults.flatMap(({ field, result }) =>
		result.refusals.map((message) => ({ message, path: [field] })),
	);
	if (issues.length > 0) throw invalidIssues(issues);
	const warnings = steResults.flatMap(({ field, result }) => result.warnings.map((message) => ({ field, message })));

	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	await setHeadSha(tx, { id: pullRequest.id, headSha: input.headSha });
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
	await announcePullRequestUpdate(ctx, tx, pullRequest);
	return { summary: summary!, warnings };
};
