import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const migrations = join(originDir(import.meta.dir), "../../drizzle");

test("the persona migration preserves assignment and session IDs", async () => {
	const before = mkdtempSync("/tmp/trellis-persona-migration-");
	cpSync(migrations, before, { recursive: true });
	const journalPath = join(before, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 40);
	writeFileSync(journalPath, JSON.stringify(journal));
	const db = await openDb(":memory:");
	await migrate(db, before);
	await db.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES ('537','Hana','Builder','builder','Build','APP','attempt','conversation',now(),now())`);
	await migrate(db, migrations);
	const result = await db.execute(sql`SELECT id,name,persona_name,terminal_id,session_id FROM agent_runs`);
	expect(result.rows).toEqual([
		{ id: "537", name: "Builder", persona_name: "Builder", terminal_id: "attempt", session_id: "conversation" },
	]);
	await db.$client.close();
});
