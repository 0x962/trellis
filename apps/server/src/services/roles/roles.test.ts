import { afterAll, beforeAll, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import { create, get, list, remove, update } from "./index.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const events: TrellisEvent[] = [];
const ctx: ServiceCtx = {
	actor: { kind: "human", name: "Role author" },
	session: null,
	reqId: ulid(),
	now: new Date("2026-10-10T16:00:00Z"),
	cache: createCache(),
	actorCache: new Map(),
	emit: (event) => events.push(event),
	dropBlobs: () => {},
	publicUrl: "http://localhost:4597",
};
beforeAll(async () => {
	db = await openTestDb();
});
afterAll(async () => {
	await db.$client.close();
});

test("global CRUD retains complete Markdown and emits each mutation", async () => {
	const body = "  # Reviewer\n\n- Check café 漢字\n".repeat(3000);
	const role = await db.transaction((tx) => create(ctx, tx, { name: " Reviewer ", body }));
	expect(role.name).toBe("Reviewer");
	expect(role.body).toBe(body);
	expect((await db.transaction((tx) => get(ctx, tx, { id: role.id }))).body).toBe(body);
	const later = { ...ctx, now: new Date("2026-10-11T16:00:00Z") };
	const updated = await db.transaction((tx) => update(later, tx, { id: role.id, name: "Writer" }));
	expect(updated.body).toBe(body);
	expect(updated.createdAt).toBe(role.createdAt);
	expect(updated.updatedAt).toBe(later.now.toISOString());
	expect((await db.transaction((tx) => list(ctx, tx))).find((row) => row.id === role.id)).toEqual(updated);
	expect((await db.transaction((tx) => update(ctx, tx, { id: role.id, body: "" }))).body).toBe("");
	expect(await db.transaction((tx) => remove(ctx, tx, { id: role.id }))).toEqual({ id: role.id });
	await expect(db.transaction((tx) => get(ctx, tx, { id: role.id }))).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(events.filter((event) => event.type === "roles.changed" && event.id === role.id)).toHaveLength(4);
});

test("writes require an actor and invalid names leave saved content intact", async () => {
	const role = await db.transaction((tx) => create(ctx, tx, { name: "Access", body: "Original" }));
	for (const operation of [
		(tx: Parameters<typeof create>[1]) => create({ ...ctx, actor: null }, tx, { name: "No actor", body: "" }),
		(tx: Parameters<typeof update>[1]) => update({ ...ctx, actor: null }, tx, { id: role.id, name: "No actor" }),
		(tx: Parameters<typeof remove>[1]) => remove({ ...ctx, actor: null }, tx, { id: role.id }),
	])
		await expect(db.transaction(operation)).rejects.toMatchObject({ code: "ACTOR_REQUIRED" });
	await expect(db.transaction((tx) => update(ctx, tx, { id: role.id, name: " \n " }))).rejects.toThrow();
	await expect(db.execute(sql`UPDATE roles SET name = '' WHERE id = ${role.id}`)).rejects.toThrow("roles_name_check");
	expect((await db.transaction((tx) => get(ctx, tx, { id: role.id }))).name).toBe("Access");
});

test("the migrated database preserves roles through archive reopen", async () => {
	const role = await db.transaction((tx) => create(ctx, tx, { name: "Archive", body: "**Exact**\n\n body\n" }));
	const archive = await db.$client.dumpDataDir("none");
	const restored = await openTestDbFromArchive(archive);
	expect(await restored.transaction((tx) => get(ctx, tx, { id: role.id }))).toEqual(role);
	await restored.$client.close();
});

test("a rollback preserves a role after update and delete", async () => {
	const role = await db.transaction((tx) => create(ctx, tx, { name: "Rollback", body: "Original" }));
	await expect(
		db.transaction(async (tx) => {
			await update(ctx, tx, { id: role.id, body: "Changed" });
			await remove(ctx, tx, { id: role.id });
			throw new Error("Rollback");
		}),
	).rejects.toThrow("Rollback");
	expect(await db.transaction((tx) => get(ctx, tx, { id: role.id }))).toEqual(role);
});

test("missing update and delete return NOT_FOUND", async () => {
	const id = ulid();
	await expect(db.transaction((tx) => update(ctx, tx, { id, body: "" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(db.transaction((tx) => remove(ctx, tx, { id }))).rejects.toMatchObject({ code: "NOT_FOUND" });
});
