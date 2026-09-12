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
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "flow-group-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < max);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

test("existing budgets become connected groups with their children and time limit", async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalUnder(27));
	await db.execute(sql`
		INSERT INTO flows (id, slug, name, created_at, updated_at) VALUES ('flow', 'review', 'Review', NOW(), NOW());
	`);
	await db.execute(sql`
		INSERT INTO flow_nodes (id, flow_id, kind, title, minutes, x, y)
		VALUES ('box', 'flow', 'budget', 'Checks', 12, 80, 40);
	`);
	await db.execute(sql`
		INSERT INTO flow_nodes (id, flow_id, parent_id, kind, title, instruction, x, y)
		VALUES ('child', 'flow', 'box', 'agent', 'Review', 'Read the diff.', 24, 48);
	`);
	await migrate(db);
	const { rows } = await db.execute(
		sql`SELECT id, kind, parent_id, parallel, minutes, instruction, x, y FROM flow_nodes ORDER BY id`,
	);
	expect(rows).toEqual([
		{ id: "box", kind: "group", parent_id: null, parallel: false, minutes: 12, instruction: "", x: 80, y: 40 },
		{
			id: "child",
			kind: "agent",
			parent_id: "box",
			parallel: false,
			minutes: null,
			instruction: "Read the diff.",
			x: 24,
			y: 48,
		},
	]);
});
