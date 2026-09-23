import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { read, write } from "./flowWaiver.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const pullRequestId = ulid();
const actor = { name: "flow-waiver-test", kind: "agent" as const };
const now = new Date("2026-09-22T12:00:00.000Z");
const later = new Date("2026-09-22T13:00:00.000Z");

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ctx = (at = now) => ({ actor, now: () => at, emit: () => {}, newTx: inTx }) as unknown as IoCtx;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (
			${pullRequestId}, 'example', 'trellis', 328, 'https://github.com/example/trellis/pull/328',
			'open', 'head-one', ${now}, ${now}
		)`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a pull request with no sentence reads null", async () => {
	expect(await inTx((tx) => read(ctx(), tx, { id: pullRequestId }))).toBeNull();
});

test("stores the sentence with the head it was written about", async () => {
	const waiver = await inTx((tx) =>
		write(ctx(), tx, { id: pullRequestId, headSha: "head-one", reason: "This change edits only the README." }),
	);

	expect(waiver).toMatchObject({
		pullRequestId,
		headSha: "head-one",
		reason: "This change edits only the README.",
		actor: { name: actor.name, kind: actor.kind },
	});
});

test("a second write at the same head replaces the sentence and keeps the first time", async () => {
	const replaced = await inTx((tx) =>
		write(ctx(later), tx, { id: pullRequestId, headSha: "head-one", reason: "The change is documentation." }),
	);

	expect(replaced.reason).toBe("The change is documentation.");
	expect(replaced.createdAt).toBe(now.toISOString());
	expect(replaced.updatedAt).toBe(later.toISOString());
});

test("a second head keeps its own sentence, and the read gives the newest", async () => {
	await inTx((tx) => write(ctx(later), tx, { id: pullRequestId, headSha: "head-two", reason: "Still docs." }));

	const found = await inTx((tx) => read(ctx(), tx, { id: pullRequestId }));

	expect(found).toMatchObject({ headSha: "head-two", reason: "Still docs." });
});

test("refuses an empty reason", async () => {
	expect(inTx((tx) => write(ctx(), tx, { id: pullRequestId, headSha: "head-one", reason: "   " }))).rejects.toThrow();
});
