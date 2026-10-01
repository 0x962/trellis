import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { boardOf, list } from "../services/tickets/read.ts";
import { createCache } from "./cache.ts";
import { openTestDb } from "./testDb.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const projectId = ulid();
const statusId = ulid();
const cache = createCache();
const ctx: ServiceCtx = {
	actor: null,
	session: null,
	reqId: ulid(),
	now: new Date("2026-09-30T12:00:00Z"),
	cache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://localhost",
};
const query = { project: "ORD", status: ["todo"], limit: 100 };

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${projectId},'ORD','order','Order',${ctx.now},${ctx.now})`);
	await db.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${projectId},'Todo','todo','todo','fg-muted',0,true,${ctx.now},${ctx.now})`);
	await db.execute(sql`INSERT INTO tickets
		(id,project_id,number,title,status_id,position,created_at,updated_at)
		SELECT '01ARZ3NDEKTSV4RRFFQ69G' || lpad(n::text,4,'0'),${projectId},n,'Ticket ' || n,${statusId},n,
			${ctx.now}::timestamptz - (103-n) * interval '1 second',
			${ctx.now}::timestamptz - n * interval '1 second'
		FROM generate_series(1,103) AS n`);
	await db.transaction((tx) => cache.rebuild(tx));
});
afterAll(async () => db.$client.close());

test("the board and default list retain complete creation order after ticket updates", async () => {
	const first = await db.transaction((tx) => list(ctx, tx, query));
	const board = await db.transaction((tx) => boardOf(ctx, tx, { project: "ORD" }));
	expect(first.items.map((item) => item.number)).toEqual(Array.from({ length: 100 }, (_, i) => 103 - i));
	expect(board.columns[0]!.items).toEqual(first.items);
	expect(board.columns[0]!.count).toBe(103);
	await db.execute(sql`UPDATE tickets SET updated_at=${ctx.now} WHERE project_id=${projectId} AND number=1`);
	await db.execute(
		sql`UPDATE tickets SET updated_at='2026-09-01T00:00:00Z' WHERE project_id=${projectId} AND number=103`,
	);
	const next = await db.transaction((tx) => list(ctx, tx, { ...query, cursor: first.nextCursor! }));
	expect(next.items.map((item) => item.number)).toEqual([3, 2, 1]);
	expect(next.nextCursor).toBeNull();
	const refreshed = await db.transaction((tx) => boardOf(ctx, tx, { project: "ORD" }));
	expect(refreshed.columns[0]!.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
});

test("an explicit Updated sort stays available and cannot supply a default-order cursor", async () => {
	const updated = await db.transaction((tx) => list(ctx, tx, { ...query, sort: "-updatedAt", limit: 1 }));
	expect(updated.items[0]!.number).toBe(1);
	await expect(db.transaction((tx) => list(ctx, tx, { ...query, cursor: updated.nextCursor! }))).rejects.toMatchObject({
		code: "INVALID_CURSOR",
	});
});
