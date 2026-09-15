import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { seedRoot } from "../../../fixtures/projects.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

test("upgrade preserves historical uncertainty and tracks unfinished delivery without invented completion", async () => {
	const directory = mkdtempSync(join(process.env.TRELLIS_HOME!, "manager-work-migration-"));
	cpSync(join(originDir(import.meta.dir), "../../drizzle"), directory, { recursive: true });
	const journalPath = join(directory, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number }[] };
	writeFileSync(
		journalPath,
		JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx < 38) }),
	);
	const db = await openDb(":memory:");
	try {
		await migrate(db, directory);
		await db.transaction(async (tx) => {
			const projectId = await seedRoot(tx, "OLD");
			for (const state of ["sent", "pending"])
				await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,state,events,due_at,created_at,updated_at)
					VALUES (${state},${projectId},${state},'[]'::jsonb,now(),now(),now())`);
		});
		writeFileSync(
			journalPath,
			JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 38) }),
		);
		expect(await migrate(db, directory)).toBe(1);
		expect(
			(await db.execute(sql`SELECT id,work_state,handled_at,outcomes FROM manager_dispatches ORDER BY id`)).rows,
		).toEqual([
			{ id: "pending", work_state: "open", handled_at: null, outcomes: [] },
			{ id: "sent", work_state: "untracked", handled_at: null, outcomes: [] },
		]);
		await db.transaction(assertStatusInvariant);
	} finally {
		await db.$client.close();
	}
});
