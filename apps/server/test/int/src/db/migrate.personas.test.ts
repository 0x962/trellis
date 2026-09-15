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

test("existing personas become reviewers without a change to their instructions", async () => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME!, "persona-migration-"));
	cpSync(join(originDir(import.meta.dir), "../../drizzle"), temp, { recursive: true });
	const file = join(temp, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 15);
	writeFileSync(file, JSON.stringify(journal));
	db = await openDb(":memory:");
	await applyMigrations(db, { migrationsFolder: temp });
	await db.execute(sql`INSERT INTO personas (id, name, instruction, created_at, updated_at)
		VALUES ('reviewer-1', 'Code Comment Clarity', 'Read the diff.\nKeep every instruction.', now(), now())`);
	await migrate(db);
	expect((await db.execute(sql`SELECT id, name, kind, instruction FROM personas`)).rows).toEqual([
		{
			id: "reviewer-1",
			name: "Code Comment Clarity",
			kind: "reviewer",
			instruction: "Read the diff.\nKeep every instruction.",
		},
	]);
	await expect(db.execute(sql`UPDATE personas SET kind = 'supervisor'`)).rejects.toThrow();
	await db.transaction(assertStatusInvariant);
});
