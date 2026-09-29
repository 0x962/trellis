import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { DIFF_PAGE_BYTES } from "../gh/diff.ts";
import type { GhRunner } from "../gh/run.ts";
import { prepareDiff } from "./pullRequestDiff.ts";
import type { PrepareCtx } from "./support.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const pullRequestId = ulid();
const firstAt = new Date("2026-09-29T12:00:00.000Z");
let now = firstAt;
let ghCalls = 0;
const outputs = [`${"a".repeat(DIFF_PAGE_BYTES)}first-tail`, `${"b".repeat(DIFF_PAGE_BYTES)}second-tail`];

const gh = Object.assign(async () => ({ ok: true as const, code: 0, stdout: outputs[ghCalls++]!, stderr: "" }), {
	bin: "gh",
	timeoutMs: 30_000,
}) satisfies GhRunner;

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const ctx = () => ({ gh, newTx: inTx, now: () => now }) as unknown as PrepareCtx;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (
			${pullRequestId}, 'example', 'trellis', 721, 'https://github.com/example/trellis/pull/721',
			'open', ${firstAt}, ${firstAt}
		)`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("rejects page two when the patch changes after the cache expires", async () => {
	const first = await prepareDiff(ctx(), { id: pullRequestId });
	now = new Date(firstAt.getTime() + 60_001);

	await expect(prepareDiff(ctx(), { id: pullRequestId, cursor: first.value.nextCursor! })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["cursor"] }] },
	});
	expect(ghCalls).toBe(2);
});
