import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import * as tickets from "../services/tickets.ts";
import { createCache } from "./cache.ts";
import { openTestDb } from "./testDb.ts";
import { type Tx, withTx } from "./tx.ts";

const at = new Date("2026-09-29T12:00:00Z");
const projectId = ulid();
const statusId = ulid();
const otherProjectId = ulid();
const otherStatusId = ulid();
const ids = Array.from({ length: 201 }, () => ulid());
const refs = ids.map((_, index) => `BIG-${index + 1}`);
let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
let emitted: TrellisEvent[];

const run = <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) =>
	withTx(
		db,
		(tx, emit) => call({ ...ctx, emit }, tx),
		(events) => {
			emitted.push(...events);
		},
	).then(({ result }) => result);

const savedRows = async () =>
	(await db.execute(sql`SELECT id, priority, parent_id, version FROM tickets ORDER BY id`)).rows;
const activityCount = async () => (await db.execute(sql`SELECT count(*)::int AS n FROM activity`)).rows;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'BIG', 'big', 'Large batches', ${at}, ${at}),
			(${otherProjectId}, 'OTHER', 'other', 'Other project', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
			(${otherStatusId}, ${otherProjectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	ctx = {
		actor: { kind: "human", name: "Batch test" },
		session: null,
		reqId: ulid(),
		now: at,
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4521",
	};
}, 60_000);

beforeEach(async () => {
	emitted = [];
	ctx.actor = { kind: "human", name: "Batch test" };
	ctx.actorCache.clear();
	await db.execute(sql`DELETE FROM tickets`);
	await db.execute(sql`DELETE FROM activity`);
	await db.execute(sql`UPDATE projects SET archived_at = NULL`);
	const values = ids.map(
		(id, index) =>
			sql`(${id}, ${projectId}, ${index + 1}, ${`Ticket ${index + 1}`}, ${statusId}, ${index}, ${at}, ${at})`,
	);
	values.push(sql`(${ulid()}, ${otherProjectId}, 1, 'Other ticket', ${otherStatusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES ${sql.join(values, sql`, `)}`);
	await withTx(db, (tx) => ctx.cache.rebuild(tx));
});

afterAll(async () => db.$client.close());

test("updates all 201 tickets in one transaction", async () => {
	const result = await run((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: refs, priority: "high" }));
	expect(result.items.map((item) => item.identifier)).toEqual(refs);
	expect(result.items.every((item) => item.priority === "high" && item.version === 2)).toBeTrue();
	expect(emitted).toHaveLength(201);
	expect(new Set(emitted.map((event) => "batchId" in event && event.batchId)).size).toBe(1);
	expect(await activityCount()).toEqual([{ n: 201 }]);
});

test("deletes all 201 tickets in one transaction", async () => {
	const result = await run((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: refs }));
	expect(result.deleted).toEqual(refs);
	expect(await savedRows()).toHaveLength(1);
	expect(emitted).toHaveLength(201);
	expect(new Set(emitted.map((event) => "batchId" in event && event.batchId)).size).toBe(1);
	expect(await activityCount()).toEqual([{ n: 201 }]);
});

for (const operation of ["updateMany", "deleteMany"] as const) {
	test(`${operation} rolls back 200 writes when the last reference is missing`, async () => {
		const before = await savedRows();
		const input = { tickets: [...refs.slice(0, 200), "BIG-999"], priority: "high" };
		await expect(
			run<unknown>((ctx, tx) =>
				operation === "updateMany"
					? tickets.updateMany(ctx, tx, input)
					: tickets.deleteMany(ctx, tx, { tickets: input.tickets }),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await savedRows()).toEqual(before);
		expect(await activityCount()).toEqual([{ n: 0 }]);
		expect(emitted).toEqual([]);
	});
}

test("a cross-project parent on the last ticket rolls back all earlier updates", async () => {
	const before = await savedRows();
	await expect(
		run((ctx, tx) =>
			tickets.updateMany(ctx, tx, {
				tickets: [...refs.slice(0, 200), "OTHER-1"],
				parent: refs[200],
				priority: "high",
			}),
		),
	).rejects.toMatchObject({ code: "CROSS_PROJECT_LINK" });
	expect(await savedRows()).toEqual(before);
	expect(await activityCount()).toEqual([{ n: 0 }]);
	expect(emitted).toEqual([]);
});

test("an archived project on the last ticket rolls back all earlier deletes", async () => {
	await db.execute(sql`UPDATE projects SET archived_at = ${at} WHERE id = ${otherProjectId}`);
	await withTx(db, (tx) => ctx.cache.rebuild(tx));
	const before = await savedRows();
	await expect(
		run((ctx, tx) =>
			tickets.deleteMany(ctx, tx, {
				tickets: [...refs.slice(0, 200), "OTHER-1"],
			}),
		),
	).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	expect(await savedRows()).toEqual(before);
	expect(await activityCount()).toEqual([{ n: 0 }]);
	expect(emitted).toEqual([]);
});

test("an agent needs force for a 201-ticket delete", async () => {
	ctx.actor = { kind: "agent", name: "Batch agent" };
	const before = await savedRows();
	await expect(run((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: refs }))).rejects.toMatchObject({
		code: "AGENT_CANNOT_DELETE",
	});
	expect(await savedRows()).toEqual(before);
	expect(emitted).toEqual([]);
	const result = await run((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: refs, force: true }));
	expect(result.deleted).toEqual(refs);
});
