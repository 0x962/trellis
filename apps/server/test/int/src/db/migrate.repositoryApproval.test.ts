import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { managerConfigOf } from "../../../../src/services/projectRows.ts";
import { seedRoot } from "../../../fixtures/projects.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

test("migration removes repository approval from saved settings without changing launch preferences", async () => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "repository-approval-migration-"));
	cpSync(join(originDir(import.meta.dir), "../../drizzle"), dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 45);
	writeFileSync(file, JSON.stringify(journal));
	const db = await openDb(":memory:");
	try {
		await migrate(db, dir);
		for (const [trustedDirectory, allowAllPermissions] of [
			[false, false],
			[false, true],
			[true, false],
			[true, true],
		]) {
			await seedRoot(db, `OLD${Number(trustedDirectory)}${Number(allowAllPermissions)}`, {
				manager_config: {
					personaId: null,
					concurrency: 7,
					directory: "/tmp/project",
					trustedDirectory,
					allowAllPermissions,
					dispatchPaused: true,
					harness: { preset: "codex" },
				},
			});
		}
		await migrate(db);
		for (const row of (await db.execute(sql`SELECT manager_config FROM projects`)).rows) {
			expect(row.manager_config).not.toHaveProperty("trustedDirectory");
			expect(row.manager_config).not.toHaveProperty("allowAllPermissions");
			expect(managerConfigOf(row as { manager_config: unknown })).toMatchObject({
				directory: "/tmp/project",
				concurrency: 7,
				dispatchPaused: true,
				harness: { preset: "codex" },
			});
		}
		await db.transaction(assertStatusInvariant);
	} finally {
		await db.$client.close();
	}
});
