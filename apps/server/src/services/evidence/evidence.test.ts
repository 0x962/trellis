import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { prepareWrite, read, write } from "./evidence.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const pullRequestId = ulid();
const actor = { name: "evidence-test", kind: "agent" as const };
const headSha = "0123456789abcdef";
const now = new Date("2026-09-20T12:00:00.000Z");
const later = new Date("2026-09-20T13:00:00.000Z");

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ctx = (at = now) =>
	({
		actor,
		now: () => at,
		emit: () => {},
		gh: async () => ({ ok: true as const, code: 0, stdout: JSON.stringify({ headRefOid: headSha }), stderr: "" }),
		newTx: inTx,
	}) as unknown as IoCtx & PrepareCtx;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (
			${pullRequestId}, 'example', 'trellis', 185, 'https://github.com/example/trellis/pull/185',
			'open', 'stale-head', ${now}, ${now}
		)`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("reads null before the agent writes the document", async () => {
	expect(await inTx((tx) => read(ctx(), tx, { id: pullRequestId }))).toBeNull();
});

test("stores the document, and a second write replaces the body", async () => {
	const body = "## Screenshot\n\n![The Overview tab](/api/evidence/01M3382EBAFX0VZFZJ7EPDBTSE/file)";
	const prepared = await prepareWrite(ctx(), { id: pullRequestId, headSha, body });
	const first = await inTx((tx) => write(ctx(), tx, prepared));
	expect(first).toMatchObject({ pullRequestId, headSha, body, actor, createdAt: now.toISOString() });
	const current = await db.execute(sql`SELECT head_sha FROM pull_requests WHERE id = ${pullRequestId}`);
	expect(current.rows).toEqual([{ head_sha: headSha }]);

	const input = await prepareWrite(ctx(later), { id: pullRequestId, headSha, body: "```\n3 pass\n```" });
	const second = await inTx((tx) => write(ctx(later), tx, input));
	expect(second).toMatchObject({
		body: "```\n3 pass\n```",
		createdAt: now.toISOString(),
		updatedAt: later.toISOString(),
	});
	expect(await inTx((tx) => read(ctx(), tx, { id: pullRequestId }))).toEqual(second);
});

test("refuses a document for an old head SHA", async () => {
	await expect(prepareWrite(ctx(), { id: pullRequestId, headSha: "old-head", body: "text" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["headSha"] }] },
	});
});

test("refuses an empty document", async () => {
	await expect(prepareWrite(ctx(), { id: pullRequestId, headSha, body: "  \n" })).rejects.toThrow();
});
