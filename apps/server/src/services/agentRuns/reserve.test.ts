import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { reserve } from "./reserve.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const doneStatus = ulid();
const ticketId = ulid();
const at = "2026-09-21T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, 'RTY', 'retry', 'Retry', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at) VALUES
		(${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
		(${doneStatus}, ${rootId}, 'Done', 'done', 'done', 'fg-muted', 1, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, completed_at, created_at, updated_at)
		VALUES (${ticketId}, ${rootId}, 1, 'Done ticket', ${doneStatus}, 0, ${at}, ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4521",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("refuses to reserve an agent for a completed ticket", async () => {
	await expect(run((tx) => reserve(ctx, tx, { ticket: "RTY-1", harness: { preset: "claude" } }))).rejects.toThrow(
		"Reopen the ticket before an agent starts.",
	);
});
