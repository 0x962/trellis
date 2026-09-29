import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { type Db, openDb } from "../client.ts";
import { actorRoles, foreignKeys, migrateActorUpgrade, openPriorDatabase, originalRows } from "./history.ts";
import { seedActorHistory } from "./seed.ts";

let db: Db;
let directory: string;
afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

test("0139 preserves every actor role and rejects mismatched UUID bindings", async () => {
	({ db, directory } = await openPriorDatabase());
	const tables = await seedActorHistory(db);
	const before = await originalRows(db, tables);
	const priorKeys = await foreignKeys(db);
	expect(await migrateActorUpgrade(db, directory)).toBe(1);
	expect(await originalRows(db, tables)).toEqual(before);
	const afterKeys = await foreignKeys(db);
	expect(afterKeys.filter((key) => key.target !== "actors")).toEqual(
		priorKeys.filter((key) => key.target !== "actors"),
	);
	const roles = await actorRoles();
	expect(roles).toHaveLength(22);
	expect(afterKeys.filter((key) => key.target === "actors")).toHaveLength(22);
	const wrong = (await db.$client.query<{ id: string }>("SELECT id FROM actors WHERE name='rename' AND kind='human'"))
		.rows[0]!.id;
	for (const role of roles) {
		const binding = (
			await db.$client.query<{ matches: boolean }>(`
			SELECT c."${role.id}"=a.id AS matches FROM "${role.table}" c
			JOIN actors a ON c."${role.name}"=a.name AND c."${role.kind}"=a.kind
		`)
		).rows;
		expect(binding.length, `${role.table}.${role.id} has historical rows`).toBeGreaterThan(0);
		expect(
			binding.every((row) => row.matches),
			`${role.table}.${role.id} preserves the exact pair`,
		).toBe(true);
		const fk = afterKeys.find((key) => key.name === role.constraint)!;
		expect(fk.definition).toBe(`FOREIGN KEY (${role.id}) REFERENCES actors(id)`);
		await expect(
			db.$client.query(`UPDATE "${role.table}" SET "${role.id}"=$1 WHERE "${role.name}" IS NOT NULL`, [wrong]),
		).rejects.toMatchObject({ code: "23503" });
		await expect(
			db.$client.query(`UPDATE "${role.table}" SET "${role.name}"='wrong' WHERE "${role.name}" IS NOT NULL`),
		).rejects.toMatchObject({ code: "23503" });
		if (!role.required) {
			expect(
				(
					await db.$client.query(
						`SELECT 1 FROM "${role.table}" WHERE "${role.name}" IS NULL AND "${role.kind}" IS NULL AND "${role.id}" IS NULL`,
					)
				).rows.length,
			).toBeGreaterThan(0);
			await expect(
				db.$client.query(`UPDATE "${role.table}" SET "${role.id}"=NULL WHERE "${role.name}" IS NOT NULL`),
			).rejects.toMatchObject({ code: "23514" });
		}
	}
	for (const assignment of ["name='changed'", "kind='agent'", "id=gen_random_uuid()"])
		await expect(
			db.$client.query(`UPDATE actors SET ${assignment} WHERE name='rename' AND kind='human'`),
		).rejects.toMatchObject({ code: "23503" });
	await expect(db.$client.query("DELETE FROM actors WHERE name='fixture' AND kind='human'")).rejects.toMatchObject({
		code: "23503",
	});
	const indexRows = (
		await db.$client.query<{ indexname: string; indexdef: string }>(`
		SELECT indexname,indexdef FROM pg_indexes WHERE indexname IN
		('page_pins_pkey','page_pins_actor_idx','page_uploads_project_actor_idx','page_versions_actor_created_at_idx')
	`)
	).rows;
	const expected = {
		page_pins_pkey: "(page_id, actor_id)",
		page_pins_actor_idx: "(actor_id, created_at, page_id)",
		page_uploads_project_actor_idx: "(project_id, actor_id, created_at)",
		page_versions_actor_created_at_idx: "(actor_id, created_at DESC)",
	};
	expect(indexRows).toHaveLength(4);
	for (const row of indexRows) expect(row.indexdef).toContain(expected[row.indexname as keyof typeof expected]);
	const ids = (await db.$client.query("SELECT name,kind,id FROM actors ORDER BY name,kind")).rows;
	const saved = await originalRows(db, tables);
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await migrateActorUpgrade(db, directory)).toBe(0);
	expect(await originalRows(db, tables)).toEqual(saved);
	expect((await db.$client.query("SELECT name,kind,id FROM actors ORDER BY name,kind")).rows).toEqual(ids);
	await db.$client.exec("BEGIN");
	await db.$client.query(
		"INSERT INTO actors (name,kind,first_seen_at,last_seen_at) VALUES ('rolled-back','human',now(),now())",
	);
	await db.$client.exec("ROLLBACK");
	expect((await db.$client.query("SELECT id FROM actors WHERE name='rolled-back'")).rows).toEqual([]);
}, 120_000);
