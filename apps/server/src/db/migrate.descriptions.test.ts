import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { SEEDED_DESCRIPTIONS } from "../../test/fixtures/statusDescriptions.ts";
import { seedActors, seedRoot, seedStatus, seedStatuses } from "../../test/fixtures";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// A database that existed before the status descriptions gets the seeded
// description on each status that carries a default name and category, and
// only where the description is still empty.

const drizzleDir = join(import.meta.dir, "../../drizzle");

type Journal = { entries: Array<{ tag: string }> };

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migrations folder whose journal stops before `tag`.
const foldersBefore = (tag: string) => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME as string, "migrate-"));
	cpSync(drizzleDir, temp, { recursive: true });
	const path = join(temp, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8")) as Journal;
	const index = journal.entries.findIndex((entry) => entry.tag === tag);
	expect(index).toBeGreaterThan(0);
	journal.entries = journal.entries.slice(0, index);
	writeFileSync(path, JSON.stringify(journal));
	return temp;
};

describe("the status description data step", () => {
	test("fills the empty description of each default status and keeps a written or custom one", async () => {
		const db = await openDb(":memory:");
		closers.push(() => db.$client.close());
		await migrate(db, foldersBefore("0006_status_descriptions"));

		await seedActors(db);
		const rootId = await seedRoot(db, "CDE");
		const ids = await seedStatuses(db, rootId);
		await db.execute(sql`UPDATE statuses SET description = 'Mine' WHERE id = ${ids.todo}`);
		await seedStatus(db, { projectId: rootId, name: "Deploy Queue", category: "started", position: 6 });
		// A status named like a default but of another category is a custom one.
		await seedStatus(db, { projectId: rootId, name: "Done Later", category: "todo", position: 7 });

		await migrate(db);

		const found = await db.execute(sql`SELECT name, description FROM statuses ORDER BY position`);
		const byName = Object.fromEntries(found.rows.map((row) => [row.name, row.description]));
		expect(byName).toEqual({
			...SEEDED_DESCRIPTIONS,
			Todo: "Mine",
			"Deploy Queue": "",
			"Done Later": "",
		});
	});
});
