import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const migrations = join(originDir(import.meta.dir), "../../drizzle");

test("the native execution migration appends direct-check instructions once", async () => {
	const priorMigrations = mkdtempSync(join(process.env.TRELLIS_HOME as string, "native-instructions-migration-"));
	cpSync(migrations, priorMigrations, { recursive: true });
	const journalPath = join(priorMigrations, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 66);
	writeFileSync(journalPath, JSON.stringify(journal));
	const db = await openDb(":memory:");
	await migrate(db, priorMigrations);
	await db.execute(
		sql`INSERT INTO personas (id, name, kind, instruction, created_at, updated_at) VALUES
			('01ARZ3NDEKTSV4RRFFQ69G5FA1', 'Builder', 'builder', 'Build.', now(), now()),
			('01ARZ3NDEKTSV4RRFFQ69G5FA2', 'Reviewer', 'reviewer', 'Review.', now(), now()),
			('01ARZ3NDEKTSV4RRFFQ69G5FA3', 'Manager', 'manager', 'Manage.', now(), now()),
			('01ARZ3NDEKTSV4RRFFQ69G5FA4', 'Custom builder', 'builder', E'Build.\n\n## Local execution\n\nKeep this custom section.', now(), now())`,
	);
	await migrate(db, migrations);
	const readInstructions = async () =>
		(await db.execute(sql`SELECT name, instruction FROM personas ORDER BY name`)).rows as Array<{
			name: string;
			instruction: string;
		}>;
	const migratedInstructions = await readInstructions();
	for (const name of ["Builder", "Reviewer"]) {
		const instruction = migratedInstructions.find((persona) => persona.name === name)!.instruction;
		expect(instruction).toContain("## Local execution");
		expect(instruction).toContain("Run each required repository command directly in the workspace.");
		expect(instruction).toContain("A failed or unrun required command blocks Agent Review.");
		expect(instruction).toContain('trellis evidence register "$TRELLIS_RUN_ID" --path');
		expect(instruction).not.toContain("trellis evidence check");
		expect(instruction).not.toContain("readyForReview");
	}
	expect(migratedInstructions.find((persona) => persona.name === "Manager")!.instruction).toBe("Manage.");
	expect(migratedInstructions.find((persona) => persona.name === "Custom builder")!.instruction).toBe(
		"Build.\n\n## Local execution\n\nKeep this custom section.",
	);
	await migrate(db, migrations);
	expect(await readInstructions()).toEqual(migratedInstructions);
	await db.$client.close();
});
