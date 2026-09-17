import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const migrations = join(originDir(import.meta.dir), "../../drizzle");
const repository = join(originDir(import.meta.dir), "../../../..");
const title = "## Human communication";
const migrationSql = readFileSync(join(migrations, "0070_human_communication.sql"), "utf8");

// 0070_human_communication.sql is the only copy of the policy text. It sits between the two
// $human$ tags, and personas.instruction gains that text with no change, so the test reads it
// from there instead of keeping a second copy that could drift.
const append = migrationSql.split("$human$")[1]!;

// personas.instruction accepts 200000 characters. The migration refuses to run when any persona
// that lacks the title cannot hold the policy, so these two sizes sit on either side of that line.
const fits = 200_000 - append.length;
const overflows = fits + 1;

const databases: Array<Awaited<ReturnType<typeof openDb>>> = [];

afterAll(async () => {
	for (const db of databases) await db.$client.close();
});

// The migration under test is the newest entry, so the database starts one step behind it.
async function migrateToPreviousStep() {
	const before = mkdtempSync(join(process.env.TRELLIS_HOME!, "human-communication-migration-"));
	cpSync(migrations, before, { recursive: true });
	const journalPath = join(before, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 70);
	writeFileSync(journalPath, JSON.stringify(journal));
	const db = await openDb(":memory:");
	databases.push(db);
	await migrate(db, before);
	return db;
}

test("the communication policy extends each persona once and keeps existing text", async () => {
	const db = await migrateToPreviousStep();
	await db.execute(sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES
		('manager','Manager','manager','Manage the project.',now(),now()),
		('builder','Builder','builder','Build the ticket.',now(),now()),
		('reviewer','Reviewer','reviewer','Review the change.',now(),now()),
		('custom','Custom','builder','Keep this section.\n\n## Human communication\n\nA person wrote this policy.',now(),now())`);
	await db.execute(sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES
		('boundary','Boundary','builder',${"x".repeat(fits)},now(),now())`);

	await migrate(db, migrations);
	const result = await db.execute(sql`SELECT id,instruction FROM personas ORDER BY id`);
	const rows = result.rows as Array<{ id: string; instruction: string }>;

	for (const id of ["manager", "builder", "reviewer"]) {
		const instruction = rows.find((row) => row.id === id)!.instruction;
		expect(instruction.split(title)).toHaveLength(2);
		expect(instruction.endsWith(append)).toBe(true);
	}
	expect(rows.find((row) => row.id === "manager")!.instruction.startsWith("Manage the project.")).toBe(true);
	expect(rows.find((row) => row.id === "custom")!.instruction).toBe(
		"Keep this section.\n\n## Human communication\n\nA person wrote this policy.",
	);
	const boundary = rows.find((row) => row.id === "boundary")!.instruction;
	expect(boundary).toHaveLength(200_000);
	expect(boundary.endsWith(append)).toBe(true);

	await migrate(db, migrations);
	expect((await db.execute(sql`SELECT id,instruction FROM personas ORDER BY id`)).rows).toEqual(result.rows);
});

test("the communication policy migration rejects an instruction that cannot fit", async () => {
	const db = await migrateToPreviousStep();
	await db.execute(sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES
		('too-long','Too long','builder',${"x".repeat(overflows)},now(),now())`);
	await expect(migrate(db, migrations)).rejects.toThrow(
		"Human communication policy exceeds the persona instruction limit",
	);
});

// docs/personas.json is a dump of the personas table that a person reads. A migration that changes
// every instruction leaves the dump stale until someone runs trellis personas list --json.
test("the persona dump carries the policy that the migration writes", () => {
	const dump = JSON.parse(readFileSync(join(repository, "docs/personas.json"), "utf8")) as Array<{
		name: string;
		instruction: string;
	}>;
	expect(dump.length).toBeGreaterThan(0);
	for (const persona of dump) {
		expect(persona.instruction.split(title)).toHaveLength(2);
	}
});
