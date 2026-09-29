import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PullRequestDiffInput, PullRequestDiffOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { diffPage, fetchDiff } from "../../gh/diff/index.ts";
import { fail, notFound, type PrepareCtx } from "../support.ts";

// The diff of one pull request lives in gh, not in the database.
// prepareDiff reads it before the service transaction opens, so no other
// call waits for gh. Each cursor carries the digest of the complete patch
// read for its first page. After the cache expires, prepareDiff rejects
// different bytes before it returns another page.
const DIFF_CACHE_MS = 60_000;
const cursorSecret = randomBytes(32);
type CachedDiff = { lastAccessedAt: number; bytes: Uint8Array; digest: string };
const diffCache = new Map<string, CachedDiff>();

const createCachedDiff = (lastAccessedAt: number, diff: string): CachedDiff => {
	const bytes = new TextEncoder().encode(diff);
	return { lastAccessedAt, bytes, digest: createHash("sha256").update(bytes).digest("hex") };
};

const invalidCursor = () => invalidInput("cursor", "The patch cursor is not valid. Start the patch read again.");

const createCursorSignature = (value: string) => createHmac("sha256", cursorSecret).update(value).digest("hex");

const parseDiffCursor = (cursor: string) => {
	const [digest, offsetText, signature] = cursor.split(":") as [string, string, string];
	const value = `${digest}:${offsetText}`;
	const expected = createCursorSignature(value);
	if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) throw invalidCursor();
	return { digest, offset: Number(offsetText) };
};

const createDiffPage = (cached: CachedDiff, offset: number): PullRequestDiffOutput => {
	if (offset > cached.bytes.byteLength || (offset === cached.bytes.byteLength && offset !== 0)) throw invalidCursor();
	const page = diffPage(cached.bytes, offset);
	if (page.nextOffset === null) return { diff: page.diff, nextCursor: null };
	const value = `${cached.digest}:${page.nextOffset}`;
	return { diff: page.diff, nextCursor: `${value}:${createCursorSignature(value)}` };
};

const findUrl = async (tx: Tx, id: string) => {
	const [row] = await rows<{ id: string; url: string }>(tx, sql`SELECT id, url FROM pull_requests WHERE id = ${id}`);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};

export type PreparedDiff = { id: string; value: PullRequestDiffOutput };

export const prepareDiff = async (ctx: PrepareCtx, input: PullRequestDiffInput): Promise<PreparedDiff> => {
	const row = await ctx.newTx((tx) => findUrl(tx, input.id));
	const lastAccessedAt = ctx.now().getTime();
	const requested = input.cursor === undefined ? null : parseDiffCursor(input.cursor);
	const cached = diffCache.get(row.id);
	if (requested !== null && cached !== undefined && cached.digest !== requested.digest)
		throw invalidInput("cursor", "The pull request patch changed. Start the patch read again.");
	if (cached !== undefined && lastAccessedAt - cached.lastAccessedAt < DIFF_CACHE_MS) {
		cached.lastAccessedAt = lastAccessedAt;
		return { id: row.id, value: createDiffPage(cached, requested?.offset ?? 0) };
	}
	const result = await fetchDiff(ctx.gh, row.url);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const fresh = createCachedDiff(lastAccessedAt, result.diff);
	diffCache.set(row.id, fresh);
	if (requested !== null && fresh.digest !== requested.digest)
		throw invalidInput("cursor", "The pull request patch changed. Start the patch read again.");
	return { id: row.id, value: createDiffPage(fresh, requested?.offset ?? 0) };
};
