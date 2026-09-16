import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const migrations = join(originDir(import.meta.dir), "../../drizzle");

test("the evidence retirement migration removes stale readiness instructions", async () => {
	const before = mkdtempSync(join(process.env.TRELLIS_HOME as string, "evidence-instructions-migration-"));
	cpSync(migrations, before, { recursive: true });
	const journalPath = join(before, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 57);
	writeFileSync(journalPath, JSON.stringify(journal));
	const db = await openDb(":memory:");
	await migrate(db, before);
	const stale =
		"If a required check fails or remains unrun, keep the ticket out of Agent Review even when evidence reports readyForReview.";
	await db.execute(
		sql`INSERT INTO personas (id, name, kind, instruction, created_at, updated_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FA1', 'Builder', 'builder', ${`Build. ${stale}`}, now(), now())`,
	);
	await migrate(db, migrations);
	const read = async () =>
		(await db.execute(sql`SELECT instruction FROM personas WHERE id='01ARZ3NDEKTSV4RRFFQ69G5FA1'`)).rows[0]!
			.instruction as string;
	const current = await read();
	expect(current).toBe("Build. If a required check fails or remains unrun, keep the ticket out of Agent Review.");
	expect(current).not.toContain("readyForReview");
	await migrate(db, migrations);
	expect(await read()).toBe(current);
	await db.$client.close();
});
