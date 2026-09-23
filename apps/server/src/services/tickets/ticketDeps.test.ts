import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache, type ProjectCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create } from "./create.ts";
import { updateDependencies } from "./deps.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ProjectCache;
const rootId = ulid();
const actor: ActorRef = { kind: "human", name: "Test" };

const ctxAt = (now: string): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: new Date(now),
	cache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://localhost:4597",
});

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const insertRoot = async (id: string, key: string) => {
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true,
			'2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')`);
};

beforeAll(async () => {
	db = await openTestDb();
	await insertRoot(rootId, "TST");
	cache = createCache();
	await run((tx) => cache.rebuild(tx));
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a cycle of three tickets fails and names its complete path", async () => {
	const ctx = ctxAt("2026-09-20T10:01:00.000Z");
	const first = await run((tx) => create(ctx, tx, { project: "TST", title: "First" }));
	await run((tx) => create(ctx, tx, { project: "TST", title: "Second", after: ["TST-1"] }));
	const third = await run((tx) => create(ctx, tx, { project: "TST", title: "Third", after: ["TST-2"] }));

	await expect(
		run((tx) => updateDependencies(ctx, tx, { ticket: "TST-1", after: ["TST-3"], expectedVersion: first.version + 1 })),
	).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
	await expect(run((tx) => updateDependencies(ctx, tx, { ticket: "TST-1", after: ["TST-3"] }))).rejects.toMatchObject({
		code: "DEPENDENCY_CYCLE",
		message: "The dependency would close this cycle: TST-1 -> TST-3 -> TST-2 -> TST-1.",
		data: { path: ["TST-1", "TST-3", "TST-2", "TST-1"] },
	});
	const found = await db.execute(sql`SELECT ticket_id, depends_on_id FROM ticket_deps ORDER BY ticket_id`);
	expect(found.rows).toHaveLength(2);

	await db.execute(sql`UPDATE ticket_deps SET source = 'derived' WHERE ticket_id = ${third.id}`);
	await run((tx) => updateDependencies(ctx, tx, { ticket: "TST-3", after: ["TST-2"] }));
	const promoted = await db.execute(sql`SELECT source FROM ticket_deps WHERE ticket_id = ${third.id}`);
	expect(promoted.rows).toEqual([{ source: "manual" }]);
	await run((tx) => updateDependencies(ctx, tx, { ticket: "TST-3", notAfter: ["TST-2"] }));
	const removed = await db.execute(sql`SELECT count(*)::int AS count FROM ticket_deps`);
	expect(removed.rows).toEqual([{ count: 1 }]);
});

test("the database check refuses a self dependency", async () => {
	const ctx = ctxAt("2026-09-20T10:03:00.000Z");
	const sixth = await run((tx) => create(ctx, tx, { project: "TST", title: "Sixth" }));
	await expect(
		run((tx) => updateDependencies(ctx, tx, { ticket: sixth.identifier, after: [sixth.identifier] })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED", message: "A ticket cannot depend on itself." });
	await expect(
		db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
			VALUES (${sixth.id}, ${sixth.id}, 'manual', ${ctx.now})`),
	).rejects.toThrow("ticket_deps_not_self");
});
