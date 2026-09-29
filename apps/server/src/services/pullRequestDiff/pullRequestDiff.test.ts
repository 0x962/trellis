import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { DIFF_PAGE_BYTES } from "../../gh/diff/index.ts";
import type { GhRunner } from "../../gh/run.ts";
import type { PrepareCtx } from "../support.ts";
import { prepareDiff } from "./pullRequestDiff.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const changedPullRequestId = ulid();
const offsetPullRequestId = ulid();
const firstAt = new Date("2026-09-29T12:00:00.000Z");
let now = firstAt;
let changedPatchCalls = 0;
const changedPatches = [`${"a".repeat(DIFF_PAGE_BYTES)}first-tail`, `${"b".repeat(DIFF_PAGE_BYTES)}second-tail`];
const offsetPatch = `${"a".repeat(DIFF_PAGE_BYTES)}€tail`;

const gh = Object.assign(
	async (_slot: "poller" | "interactive", args: string[]) => {
		const url = args.at(-1)!;
		const stdout = url.endsWith("/721") ? changedPatches[changedPatchCalls++]! : offsetPatch;
		return { ok: true as const, code: 0, stdout, stderr: "" };
	},
	{ bin: "gh", timeoutMs: 30_000 },
) satisfies GhRunner;

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const ctx = () => ({ gh, newTx: inTx, now: () => now }) as unknown as PrepareCtx;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES
		(
			${changedPullRequestId}, 'example', 'trellis', 721, 'https://github.com/example/trellis/pull/721',
			'open', ${firstAt}, ${firstAt}
		),
		(
			${offsetPullRequestId}, 'example', 'trellis', 722, 'https://github.com/example/trellis/pull/722',
			'open', ${firstAt}, ${firstAt}
		)`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("rejects page two when the patch changes after the cache expires", async () => {
	const first = await prepareDiff(ctx(), { id: changedPullRequestId });
	now = new Date(firstAt.getTime() + 60_001);

	await expect(prepareDiff(ctx(), { id: changedPullRequestId, cursor: first.value.nextCursor! })).rejects.toMatchObject(
		{
			code: "INPUT_VALIDATION_FAILED",
			data: { issues: [{ path: ["cursor"] }] },
		},
	);
	expect(changedPatchCalls).toBe(2);
});

test("rejects an altered page offset", async () => {
	const first = await prepareDiff(ctx(), { id: offsetPullRequestId });
	const [digest, offset, signature] = first.value.nextCursor!.split(":");
	const alteredCursor = `${digest}:${Number(offset) + 1}:${signature}`;

	await expect(prepareDiff(ctx(), { id: offsetPullRequestId, cursor: alteredCursor })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["cursor"] }] },
	});
});
