import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const pendingCount = JSON.parse(readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8")).entries.filter(
	(entry: { idx: number }) => entry.idx >= 23,
).length;
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migration folder whose journal stops below 23, so a run
// against it applies every migration up to 0022 and leaves 0023 pending.
const journalBefore23 = () => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "target-launch-migration-"));
	cpSync(drizzleDir, dir, { recursive: true });
	const file = join(dir, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(file, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 23);
	writeFileSync(file, JSON.stringify(journal));
	return dir;
};

const withTemplate = async (template: string) => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, journalBefore23());
	await db.execute(
		sql`INSERT INTO settings (key, value, updated_at) VALUES ('agentLaunchCommand', ${JSON.stringify(template)}::jsonb, NOW())`,
	);
	return db;
};

const templateOf = async (db: Awaited<ReturnType<typeof openDb>>) =>
	(await db.execute(sql`SELECT value FROM settings WHERE key = 'agentLaunchCommand'`)).rows[0]?.value;

// What migration 0022 leaves behind, and what anyone who kept the older
// default still holds. It names the local machine, so an agent of a project
// that picks a Superset host runs on the machine that runs the server.
const local =
	"{{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json";

test("the target launch migration adds the target variable", async () => {
	const db = await withTemplate(local);

	expect(await migrate(db)).toBe(pendingCount);
	expect(await templateOf(db)).toBe(
		"{{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json",
	);
});

test("the target launch migration leaves a template a person wrote", async () => {
	const own = "{{superset}} ws create --local --project {{projectId}} --name {{name}} --tag mine --json";
	const db = await withTemplate(own);

	expect(await migrate(db)).toBe(pendingCount);
	expect(await templateOf(db)).toBe(own);
});
