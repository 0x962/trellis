import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { create, get, list, update } from "./notes.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const projectId = ulid();
const cache = createCache();
const ctx: ServiceCtx = {
	actor: { kind: "human", name: "Note author" },
	session: null,
	reqId: ulid(),
	now: new Date("2026-09-29T20:00:00.000Z"),
	cache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://localhost:4597",
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TST', 'test', 'Test', ${ctx.now}, ${ctx.now})`);
	await db.transaction((tx) => cache.rebuild(tx));
});

afterAll(async () => {
	await db.$client.close();
});

test("create, edit, get, and list retain complete multibyte note bodies", async () => {
	const body = "漢字 café 𐐷\n".repeat(2000).trim();
	const note = await db.transaction((tx) => create(ctx, tx, { project: "TST", title: "Long note", body }));
	expect(note.body).toBe(body);
	expect((await db.transaction((tx) => get(ctx, tx, { id: note.id }))).body).toBe(body);
	const edited = `${body}\n${"é変更𐐷".repeat(2000)}`;
	expect((await db.transaction((tx) => update(ctx, tx, { id: note.id, body: edited }))).body).toBe(edited);
	expect((await db.transaction((tx) => get(ctx, tx, { id: note.id }))).body).toBe(edited);
	expect(
		(await db.transaction((tx) => list(ctx, tx, { project: "TST" }))).find((row) => row.id === note.id)?.body,
	).toBe(edited);
	await expect(db.execute(sql`UPDATE notes SET body = '' WHERE id = ${note.id}`)).rejects.toThrow("notes_body_check");
	await expect(db.transaction((tx) => update(ctx, tx, { id: note.id, body: " \n " }))).rejects.toThrow();
	expect((await db.transaction((tx) => get(ctx, tx, { id: note.id }))).body).toBe(edited);
});

test("long notes still require an actor and an active project", async () => {
	const input = { project: "TST", title: "Access", body: "界".repeat(4001) };
	await expect(db.transaction((tx) => create({ ...ctx, actor: null }, tx, input))).rejects.toMatchObject({
		code: "ACTOR_REQUIRED",
	});
	const note = await db.transaction((tx) => create(ctx, tx, input));
	await expect(
		db.transaction((tx) => update({ ...ctx, actor: null }, tx, { id: note.id, body: input.body })),
	).rejects.toMatchObject({ code: "ACTOR_REQUIRED" });
	await db.execute(sql`UPDATE projects SET archived_at = ${ctx.now} WHERE id = ${projectId}`);
	await db.transaction((tx) => cache.rebuild(tx));
	await expect(db.transaction((tx) => create(ctx, tx, input))).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	await expect(db.transaction((tx) => update(ctx, tx, { id: note.id, body: input.body }))).rejects.toMatchObject({
		code: "PROJECT_ARCHIVED",
	});
	expect((await db.transaction((tx) => get(ctx, tx, { id: note.id }))).body).toBe(input.body);
});
