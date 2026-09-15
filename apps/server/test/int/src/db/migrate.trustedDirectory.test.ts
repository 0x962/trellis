import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { seedRoot } from "../../../fixtures/projects.ts";

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migration folder whose journal stops below `max`. A run
// against it applies the migrations before that index only, so a test drives
// one migration and reads what that migration alone wrote.
const journalUnder = (max: number) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "trusted-directory-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("the trusted directory migration removes the setting and keeps the rest of the project config", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(38));
	const config = { personaId: null, concurrency: 2, directory: "/tmp", dispatchPaused: true };
	await seedRoot(db, "OLD", { manager_config: { ...config, trustedDirectory: false } });
	await seedRoot(db, "NEW", { manager_config: { ...config, trustedDirectory: true } });

	expect(await migrate(db, journalUnder(39))).toBe(1);
	const found = await db.execute(sql`SELECT manager_config FROM projects ORDER BY key`);
	expect(found.rows.map((row) => row.manager_config)).toEqual([config, config]);
	for (const row of found.rows) expect(ProjectManagerConfigSchema.safeParse(row.manager_config).success).toBe(true);
});
