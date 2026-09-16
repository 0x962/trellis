import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const migrations = join(originDir(import.meta.dir), "../../drizzle");

// 0052 appends the `## Project notes` section to every saved persona: the
// CLI form to builders and reviewers, the tool form to managers. A persona
// that already holds the section keeps one copy, so a rerun changes nothing.
test("the notes migration appends one Project notes section per persona kind", async () => {
	const before = mkdtempSync(join(process.env.TRELLIS_HOME as string, "notes-migration-"));
	cpSync(migrations, before, { recursive: true });
	const journalPath = join(before, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 52);
	writeFileSync(journalPath, JSON.stringify(journal));
	const db = await openDb(":memory:");
	await migrate(db, before);
	await db.execute(sql`INSERT INTO personas (id, name, kind, instruction, created_at, updated_at) VALUES
		('01ARZ3NDEKTSV4RRFFQ69G5FA1', 'Builder', 'builder', 'Build.', now(), now()),
		('01ARZ3NDEKTSV4RRFFQ69G5FA2', 'Reviewer', 'reviewer', 'Review.', now(), now()),
		('01ARZ3NDEKTSV4RRFFQ69G5FA3', 'Manager', 'manager', 'Manage.', now(), now())`);
	await migrate(db, migrations);
	const read = async () =>
		(await db.execute(sql`SELECT kind, instruction FROM personas ORDER BY kind`)).rows as {
			kind: string;
			instruction: string;
		}[];
	const after = await read();
	for (const persona of after) {
		expect(persona.instruction.split("## Project notes")).toHaveLength(2);
		expect(persona.instruction).toContain("Never put a credential, a token, or a log in a note.");
	}
	const byKind = Object.fromEntries(after.map((persona) => [persona.kind, persona.instruction]));
	expect(byKind.builder).toContain("trellis notes add <project>");
	expect(byKind.reviewer).toContain("trellis notes add <project>");
	expect(byKind.manager).toContain("trellis_notes_create");
	expect(byKind.manager).not.toContain("trellis notes add");
	await migrate(db, migrations);
	expect(await read()).toEqual(after);
	await db.$client.close();
});
