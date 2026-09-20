import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create } from "./create.ts";
import { setOutcome } from "./outcome.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'OUT', 'out', 'Outcome', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true,
			'2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "agent", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-20T10:01:00Z"),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("the outcome write stores one sentence and refuses a second sentence", async () => {
	const created = await run((tx) => create(ctx, tx, { project: "OUT", title: "Record an outcome" }));
	const updated = await run((tx) =>
		setOutcome(ctx, tx, {
			ticket: created.identifier,
			outcome: "The ticket stores the contract fields.",
			expectedVersion: created.version,
		}),
	);
	expect(updated.outcome).toBe("The ticket stores the contract fields.");
	const activityRows = await db.execute(
		sql`SELECT field, from_value, to_value FROM activity
			WHERE ticket_id = ${created.id} AND action = 'ticket.updated' ORDER BY id`,
	);
	expect(activityRows.rows).toEqual([{ field: "outcome", from_value: null, to_value: null }]);
	await expect(
		run((tx) =>
			setOutcome(ctx, tx, { ticket: created.identifier, outcome: "The first sentence ends. The second starts." }),
		),
	).rejects.toThrow("Enter one sentence.");
	const rows = await db.execute(sql`SELECT outcome, version FROM tickets WHERE id = ${created.id}`);
	expect(rows.rows).toEqual([{ outcome: updated.outcome, version: updated.version }]);
});
