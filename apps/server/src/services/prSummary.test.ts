import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { read, write } from "./prSummary.ts";
import type { IoCtx } from "./support.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
const pullRequestId = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${pullRequestId}, 'example', 'operator', 56930, 'https://github.com/example/operator/pull/56930',
			'open', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	ctx = {
		now: () => new Date("2026-09-20T10:01:00Z"),
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
	const stored = await run((tx) => write(ctx, tx, input));
	expect(stored).toEqual({
		pullRequestId,
		headSha: input.headSha,
		headline: input.headline,
		why: input.why,
		watch: input.watch,
	});
	expect(await run((tx) => read(ctx, tx, { id: pullRequestId }))).toEqual(stored);
});

test("one STE refusal stores nothing", async () => {
	const refused = run((tx) =>
		write(ctx, tx, {
			id: pullRequestId,
			headSha: "def456",
			headline: "Give the Operator message post a timeout.",
			why: "Keep this — short.",
			watch: "nothing",
		}),
	);
	await expect(refused).rejects.toMatchObject({
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
	const count = await db.execute(sql`SELECT count(*)::int AS count FROM pr_summaries WHERE head_sha = 'def456'`);
	expect(count.rows).toEqual([{ count: 0 }]);
});
