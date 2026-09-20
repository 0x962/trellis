import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { prepareWrite, read, readHead, write } from "./prSummary.ts";
import type { IoCtx, PrepareCtx } from "./support.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
const pullRequestId = ulid();
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
let now = new Date("2026-09-20T10:01:00Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${pullRequestId}, 'example', 'operator', 56930, 'https://github.com/example/operator/pull/56930',
			'open', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	ctx = {
		now: () => now,
	} as IoCtx;
}, 30_000);

afterAll(async () => db.$client.close());

test("the worked summary stores for its head SHA", async () => {
	const input = {
		id: pullRequestId,
		headSha: "abc123",
		headline: "Give the Operator message post a timeout.",
		why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed and the close button dead. An AbortError now reads as a refusal. The screen takes the mode from the thread, not from the dialog.",
		watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
	};
	const output = await inTx((tx) => write(ctx, tx, input));
	expect(output).toEqual({
		summary: {
			pullRequestId,
			headSha: input.headSha,
			headline: input.headline,
			why: input.why,
			watch: input.watch,
		},
		warnings: [],
	});
	expect(await inTx((tx) => read(ctx, tx, { id: pullRequestId }))).toEqual(output.summary);
	expect(await inTx((tx) => readHead(ctx, tx, { id: pullRequestId, headSha: input.headSha }))).toEqual(output.summary);
});

test("a rewrite of an older head does not make that head newest", async () => {
	now = new Date("2026-09-20T10:02:00Z");
	const next = await inTx((tx) =>
		write(ctx, tx, {
			id: pullRequestId,
			headSha: "def456",
			headline: "Store the next head summary.",
			why: "The pull request now has another head.",
			watch: "nothing",
		}),
	);
	now = new Date("2026-09-20T10:03:00Z");
	await inTx((tx) =>
		write(ctx, tx, {
			id: pullRequestId,
			headSha: "abc123",
			headline: "Give the Operator message post a timeout.",
			why: "The first head now has new text.",
			watch: "nothing",
		}),
	);
	expect(await inTx((tx) => read(ctx, tx, { id: pullRequestId }))).toEqual(next.summary);
});

test("one STE refusal stores nothing", async () => {
	const attempt = inTx((tx) =>
		write(ctx, tx, {
			id: pullRequestId,
			headSha: "ghi789",
			headline: "Give the Operator message post a timeout.",
			why: "Keep this — short.",
			watch: "nothing",
		}),
	);
	await expect(attempt).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: {
			issues: [
				{
					message: "sentence 1 holds an em dash. Use a comma, a period or a colon.",
					path: ["why"],
				},
			],
		},
	});
	const afterRefusal = await db.execute(sql`SELECT count(*)::int AS count FROM pr_summaries WHERE head_sha = 'ghi789'`);
	expect(afterRefusal.rows).toEqual([{ count: 0 }]);
});

test("an STE warning reports and stores", async () => {
	const output = await inTx((tx) =>
		write(ctx, tx, {
			id: pullRequestId,
			headSha: "jkl012",
			headline: "Store the summary.",
			why: "The text is written by the agent.",
			watch: "nothing",
		}),
	);
	expect(output.warnings).toEqual([
		{ field: "why", message: 'sentence 1 is passive: "is written by". Name the actor.' },
	]);
	expect(await inTx((tx) => readHead(ctx, tx, { id: pullRequestId, headSha: "jkl012" }))).toEqual(output.summary);
});

test("a write refuses a SHA that is not the current pull request head", async () => {
	const gh = Object.assign(
		async () => ({
			ok: true as const,
			code: 0,
			stdout: JSON.stringify({ headRefOid: "current-sha" }),
			stderr: "",
		}),
		{ bin: "gh", timeoutMs: 30_000 },
	);
	const prepareCtx: PrepareCtx = {
		...ctx,
		newTx: inTx,
		gh,
	};
	const attempt = prepareWrite(prepareCtx, {
		id: pullRequestId,
		headSha: "old-sha",
		headline: "Store the current head summary.",
		why: "The head identifies the text.",
		watch: "nothing",
	});
	await expect(attempt).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: {
			issues: [
				{
					message: "headSha does not match the current pull request head.",
					path: ["headSha"],
				},
			],
		},
	});
});
