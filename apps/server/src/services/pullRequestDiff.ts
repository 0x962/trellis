import { createHash } from "node:crypto";
import type { PullRequestDiffInput, PullRequestDiffOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { invalidInput } from "../errors.ts";
import { diffPage, fetchDiff } from "../gh/diff.ts";
import { fail, notFound, type PrepareCtx } from "./support.ts";

// The diff of one pull request lives in gh, not in the database.
// prepareDiff reads it before the service transaction opens, so no other
// call waits for gh. Each cursor carries the digest of the bytes from its
// first page. After the cache expires, prepareDiff rejects different bytes
// before it returns another page.
const DIFF_CACHE_MS = 60_000;
type CachedDiff = { at: number; bytes: Uint8Array; digest: string };
const diffCache = new Map<string, CachedDiff>();

const cacheValue = (at: number, diff: string): CachedDiff => {
	const bytes = new TextEncoder().encode(diff);
	return { at, bytes, digest: createHash("sha256").update(bytes).digest("hex") };
};

const cursorValue = (cursor: string) => ({ digest: cursor.slice(0, 64), offset: Number(cursor.slice(65)) });

const outputPage = (cached: CachedDiff, offset: number): PullRequestDiffOutput => {
	if (offset > cached.bytes.byteLength || (offset === cached.bytes.byteLength && offset !== 0))
		throw invalidInput("cursor", "The patch cursor is not valid. Start the patch read again.");
	const page = diffPage(cached.bytes, offset);
	return {
		diff: page.diff,
		nextCursor: page.nextOffset === null ? null : `${cached.digest}:${page.nextOffset}`,
	};
};

const findUrl = async (tx: Tx, id: string) => {
	const [row] = await rows<{ id: string; url: string }>(tx, sql`SELECT id, url FROM pull_requests WHERE id = ${id}`);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};

export type PreparedDiff = { id: string; value: PullRequestDiffOutput };

export const prepareDiff = async (ctx: PrepareCtx, input: PullRequestDiffInput): Promise<PreparedDiff> => {
	const row = await ctx.newTx((tx) => findUrl(tx, input.id));
	const at = ctx.now().getTime();
	const requested = input.cursor === undefined ? null : cursorValue(input.cursor);
	const cached = diffCache.get(row.id);
	if (requested !== null && cached !== undefined && cached.digest !== requested.digest)
		throw invalidInput("cursor", "The pull request patch changed. Start the patch read again.");
	if (cached !== undefined && at - cached.at < DIFF_CACHE_MS) {
		cached.at = at;
		return { id: row.id, value: outputPage(cached, requested?.offset ?? 0) };
	}
	const result = await fetchDiff(ctx.gh, row.url);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const fresh = cacheValue(at, result.diff);
	diffCache.set(row.id, fresh);
	if (requested !== null && fresh.digest !== requested.digest)
		throw invalidInput("cursor", "The pull request patch changed. Start the patch read again.");
	return { id: row.id, value: outputPage(fresh, requested?.offset ?? 0) };
};
