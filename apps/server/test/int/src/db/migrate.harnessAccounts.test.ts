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
test("account instructions extend manager personas and preserve existing conversations", async () => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME!, "accounts-migration-"));
	cpSync(join(originDir(import.meta.dir), "../../drizzle"), temp, { recursive: true });
	const path = join(temp, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 48);
	writeFileSync(path, JSON.stringify(journal));
	db = await openDb(":memory:");
	await applyMigrations(db, { migrationsFolder: temp });
	await db.execute(
		sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES ('manager','Manager','manager','Keep this policy.',now(),now()),('builder','Builder','builder','Build.',now(),now())`,
	);
	await db.execute(
		sql`INSERT INTO agent_runs(id,name,runtime,persona_id,persona_name,project_path,kind,instruction,session_id,created_at,updated_at) VALUES ('run','Manager','native','manager','Manager','PROJECT','manager','Keep this policy.','provider-session',now(),now())`,
	);
	await migrate(db);
	const result = await db.execute(sql`SELECT instruction FROM personas WHERE id='manager'`);
	expect(result.rows[0]!.instruction).toContain("Keep this policy.\n\n## Harness accounts");
	expect(result.rows[0]!.instruction).toContain("agentRuns.resume");
	expect(result.rows[0]!.instruction).toContain("submanagers.start");
	expect(result.rows[0]!.instruction).toContain("## Autonomous project delegation");
	expect((await db.execute(sql`SELECT instruction FROM personas WHERE id='builder'`)).rows[0]!.instruction).toBe(
		"Build.",
	);
	expect((await db.execute(sql`SELECT session_id FROM agent_runs WHERE id='run'`)).rows[0]!.session_id).toBe(
		"provider-session",
	);
	await migrate(db);
	expect((await db.execute(sql`SELECT instruction FROM personas WHERE id='manager'`)).rows).toEqual(result.rows);
	await db.transaction(assertStatusInvariant);
});
