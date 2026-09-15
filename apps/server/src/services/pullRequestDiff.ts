import type { PullRequestDiffOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fetchDiff } from "../gh/diff.ts";
import { fail, notFound, type PrepareCtx } from "./support.ts";

// The diff of one pull request lives in gh, not in the database.
// prepareDiff reads it before the service transaction opens, so no other
// call waits for gh. The cache holds each diff by pull request id with the
// clock reading of the gh call, so a person who reopens a diff inside a
// minute spawns no process.
const DIFF_CACHE_MS = 60_000;
const diffCache = new Map<string, { at: number; value: PullRequestDiffOutput }>();

const findUrl = async (tx: Tx, id: string) => {
	const [row] = await rows<{ id: string; url: string }>(tx, sql`SELECT id, url FROM pull_requests WHERE id = ${id}`);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};

export type DiffInput = { id: string };

// The pull request id with its diff.
export type PreparedDiff = { id: string; value: PullRequestDiffOutput };

export const prepareDiff = async (ctx: PrepareCtx, input: DiffInput): Promise<PreparedDiff> => {
	const row = await ctx.newTx((tx) => findUrl(tx, input.id));
	const at = ctx.now().getTime();
	const cached = diffCache.get(row.id);
	if (cached !== undefined && at - cached.at < DIFF_CACHE_MS) return { id: row.id, value: cached.value };
	const result = await fetchDiff(ctx.gh, row.url);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const value = { diff: result.diff, truncated: result.truncated, url: result.url };
	diffCache.set(row.id, { at, value });
	return { id: row.id, value };
};
