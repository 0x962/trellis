import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { cancel } from "../../cancel";
import { fixture, harness } from "../components/fixture";
import { set } from "./set.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("migration preserves existing epics and leaves autopilot off", async () => {
	const select = sql`SELECT id, description, canceled_at, actor_id, updated_at FROM epics ORDER BY id`;
	const before = (await h.db.execute(select)).rows;
	await h.db.execute(sql`ALTER TABLE epics DROP COLUMN autopilot`);
	const migration = await readFile(new URL("../../../../../drizzle/0145_epic_autopilot.sql", import.meta.url), "utf8");
	await h.db.execute(sql.raw(migration));
	expect((await h.db.execute(select)).rows).toEqual(before);
	expect(await h.get()).toBeNull();
});

test("settings retain the harness and limit through disable and enable", async () => {
	await h.enable(7);
	expect(await h.get()).toEqual({ enabled: true, maxConcurrency: 7, harness, accountId: null });
	await h.enable(7, false);
	expect(await h.get()).toEqual({ enabled: false, maxConcurrency: 7, harness, accountId: null });
	expect(h.events.at(-1)).toEqual({ type: "epics.changed", projectId: h.projectId, id: h.epic.id });
});

test("concurrency requires a positive safe integer", async () => {
	for (const maxConcurrency of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
		await expect(h.enable(maxConcurrency)).rejects.toThrow();
	expect(await h.get()).toBeNull();
});

test("enable requires a started status and a compatible account", async () => {
	const accountId = ulid();
	await h.db.execute(sql`INSERT INTO harness_accounts (id, name, harness, profile_path, created_at, updated_at)
		VALUES (${accountId}, 'Claude', 'claude', '/fixture/claude', ${h.ctx.now}, ${h.ctx.now})`);
	await expect(
		h.run((tx) =>
			set(h.ctx, tx, { epic: h.epic.id, autopilot: { enabled: true, maxConcurrency: 1, harness, accountId } }),
		),
	).rejects.toThrow("Select an account");
	await h.db.execute(sql`DELETE FROM statuses WHERE project_id = ${h.projectId} AND category = 'started'`);
	await h.run((tx) => h.cache.rebuild(tx));
	await expect(h.enable()).rejects.toMatchObject({ code: "STATUS_NOT_IN_PROJECT" });
	expect(await h.get()).toBeNull();
});

test("settings require an actor and an active project", async () => {
	const input = { epic: h.epic.id, autopilot: { enabled: true, maxConcurrency: 1, harness, accountId: null } };
	await expect(h.run((tx) => set({ ...h.ctx, actor: null }, tx, input))).rejects.toMatchObject({
		code: "ACTOR_REQUIRED",
	});
	await h.db.execute(sql`UPDATE projects SET archived_at = ${h.ctx.now} WHERE id = ${h.projectId}`);
	await h.run((tx) => h.cache.rebuild(tx));
	await expect(h.enable()).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
});

test("cancellation blocks enable and permits disable", async () => {
	await h.enable();
	await h.run((tx) => cancel(h.ctx, tx, { epic: h.epic.id }));
	expect((await h.get())?.enabled).toBe(false);
	await expect(h.enable()).rejects.toThrow("A canceled epic");
	await h.enable(2, false);
	expect((await h.get())?.enabled).toBe(false);
});
