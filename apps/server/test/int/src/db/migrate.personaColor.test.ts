import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migration folder whose journal stops below `max`, so a run
// against it applies the migrations before that index only.
const journalUnder = (max: number) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "persona-color-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("a persona from before the color column takes accent and an empty description", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(38));
	await db.execute(sql`INSERT INTO personas (id, name, kind, instruction, created_at, updated_at)
		VALUES ('persona-1', 'Feature Builder', 'builder', 'Build carefully.', now(), now())`);
	await migrate(db);
	expect((await db.execute(sql`SELECT name, color, description FROM personas`)).rows).toEqual([
		{ name: "Feature Builder", color: "accent", description: "" },
	]);
	await expect(db.execute(sql`UPDATE personas SET color = 'purple'`)).rejects.toThrow(/personas_color_check/);
	await expect(db.execute(sql`UPDATE personas SET description = repeat('d', 2001)`)).rejects.toThrow(
		/personas_description_check/,
	);
});
