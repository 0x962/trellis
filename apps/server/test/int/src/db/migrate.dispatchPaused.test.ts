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
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "dispatch-paused-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("the migration removes the stored dispatch pause and keeps every other manager setting", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(66));
	const stored = { personaId: null, directory: "/tmp/project", harness: { preset: "codex" } };
	await seedRoot(db, "PAU", { manager_config: { ...stored, dispatchPaused: true } });
	await seedRoot(db, "NUL", { manager_config: null });

	expect(await migrate(db, journalUnder(67))).toBe(1);
	const configs = await db.execute(sql`SELECT key, manager_config FROM projects ORDER BY key`);
	expect(configs.rows).toEqual([
		{ key: "NUL", manager_config: null },
		{ key: "PAU", manager_config: stored },
	]);
	expect(ProjectManagerConfigSchema.safeParse(configs.rows[1]!.manager_config).success).toBe(true);
});
