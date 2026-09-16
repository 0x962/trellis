import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as applyMigrations } from "drizzle-orm/pglite/migrator";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let db: Awaited<ReturnType<typeof openDb>>;
afterAll(async () => {
	await db.$client.close();
});
test("Muse harness instructions extend manager personas once and leave workers alone", async () => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME!, "muse-migration-"));
	cpSync(join(originDir(import.meta.dir), "../../drizzle"), temp, { recursive: true });
	const path = join(temp, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 60);
	writeFileSync(path, JSON.stringify(journal));
	db = await openDb(":memory:");
	await applyMigrations(db, { migrationsFolder: temp });
	await db.execute(
		sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES ('manager','Manager','manager','Keep this policy.',now(),now()),('builder','Builder','builder','Build.',now(),now())`,
	);
	await migrate(db);
	const result = await db.execute(sql`SELECT instruction FROM personas WHERE id='manager'`);
	expect(result.rows[0]!.instruction).toContain("Keep this policy.\n\n## Muse harness");
	expect(result.rows[0]!.instruction).toContain("meta/muse-spark-1.3");
	expect(result.rows[0]!.instruction).toContain("agentRuns.send");
	expect((await db.execute(sql`SELECT instruction FROM personas WHERE id='builder'`)).rows[0]!.instruction).toBe(
		"Build.",
	);
	await migrate(db);
	expect((await db.execute(sql`SELECT instruction FROM personas WHERE id='manager'`)).rows).toEqual(result.rows);
	await db.transaction(assertStatusInvariant);
});
