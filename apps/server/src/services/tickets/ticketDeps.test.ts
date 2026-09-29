import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache, type ProjectCache } from "../../db/cache.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create } from "./create.ts";
import { dependencies } from "./dependencies";
import { updateDependencies } from "./deps.ts";
import { get } from "./read.ts";

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
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true,
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

test("exact dependencies retain completed and cross-project edges; removals preserve every other edge after reopen", async () => {
	const ctx = ctxAt("2026-09-29T19:00:00.000Z");
	const otherId = ulid();
	await insertRoot(otherId, "EXT");
	await run((tx) => cache.rebuild(tx));
	const a = await run((tx) => create(ctx, tx, { project: "TST", title: "A" }));
	const b = await run((tx) => create(ctx, tx, { project: "TST", title: "B", after: [a.identifier] }));
	const c = await run((tx) => create(ctx, tx, { project: "TST", title: "C", after: [a.identifier] }));
	const d = await run((tx) => create(ctx, tx, { project: "EXT", title: "D" }));
	const doneId = ulid();
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${doneId}, ${otherId}, 'Done', 'done', 'done', 'fg-muted', 1, false, ${ctx.now}, ${ctx.now})`);
	await db.execute(sql`UPDATE tickets SET status_id = ${doneId}, completed_at = ${ctx.now} WHERE id = ${d.id}`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
		VALUES (${a.id}, ${d.id}, 'manual', ${ctx.now}), (${c.id}, ${d.id}, 'manual', ${ctx.now})`);
	await run((tx) => cache.rebuild(tx));
	const exact = await run((tx) => dependencies(ctx, tx, { ticket: a.identifier }));
	expect(exact.waitsOn).toEqual([{ identifier: d.identifier, title: "D", status: "done" }]);
	expect(exact.blocks.map((t) => t.identifier)).toEqual([b.identifier, c.identifier]);
	expect((await run((tx) => get(ctx, tx, { ticket: a.identifier }))).waitsOn).toEqual([]);
	await expect(
		run((tx) => updateDependencies(ctx, tx, { ticket: b.identifier, after: [d.identifier] })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const before = (
		await db.execute(sql`SELECT ticket_id, depends_on_id FROM ticket_deps ORDER BY ticket_id, depends_on_id`)
	).rows;
	await run((tx) => updateDependencies(ctx, tx, { ticket: a.identifier, notAfter: [d.identifier] }));
	await run((tx) => updateDependencies(ctx, tx, { ticket: b.identifier, notAfter: [a.identifier] }));
	const archive = await db.$client.dumpDataDir("none");
	const reopened = await openTestDbFromArchive(archive);
	const expected = before.filter(
		(edge) =>
			!(edge.ticket_id === a.id && edge.depends_on_id === d.id) &&
			!(edge.ticket_id === b.id && edge.depends_on_id === a.id),
	);
	expect(
		(await reopened.execute(sql`SELECT ticket_id, depends_on_id FROM ticket_deps ORDER BY ticket_id, depends_on_id`))
			.rows,
	).toEqual(expected);
	expect(await reopened.transaction((tx) => dependencies(ctx, tx, { ticket: a.identifier }))).toEqual({
		waitsOn: [],
		blocks: [{ identifier: c.identifier, title: "C", status: "todo" }],
	});
	expect(
		(await reopened.transaction((tx) => dependencies(ctx, tx, { ticket: d.identifier }))).blocks.map(
			(t) => t.identifier,
		),
	).toEqual([c.identifier]);
	expect((await reopened.transaction((tx) => get(ctx, tx, { ticket: b.identifier }))).waitsOn).toEqual([]);
	await reopened.$client.close();
});

test("an archived target refuses removal and keeps its edge", async () => {
	const ctx = ctxAt("2026-09-29T19:01:00.000Z");
	const projectId = ulid();
	await insertRoot(projectId, "ARC");
	await run((tx) => cache.rebuild(tx));
	const a = await run((tx) => create(ctx, tx, { project: "ARC", title: "A" }));
	const b = await run((tx) => create(ctx, tx, { project: "ARC", title: "B", after: [a.identifier] }));
	await db.execute(sql`UPDATE projects SET archived_at = ${ctx.now} WHERE id = ${projectId}`);
	await run((tx) => cache.rebuild(tx));
	await expect(
		run((tx) => updateDependencies(ctx, tx, { ticket: b.identifier, notAfter: [a.identifier] })),
	).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	expect((await run((tx) => dependencies(ctx, tx, { ticket: b.identifier }))).waitsOn.map((t) => t.identifier)).toEqual(
		[a.identifier],
	);
});
