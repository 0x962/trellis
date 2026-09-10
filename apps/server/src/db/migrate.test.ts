import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const drizzleDir = join(import.meta.dir, "../../drizzle");

type Journal = { entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };

const readJournal = (dir: string) => JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as Journal;

const tables = [
	"projects",
	"repos",
	"statuses",
	"tickets",
	"comments",
	"attachments",
	"pull_requests",
	"ticket_pull_requests",
	"activity",
	"actors",
	"settings",
	"agent_sessions",
	"agent_cursors",
	"agent_pings",
];

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const close of closers) await close();
});

const openMigrated = async () => {
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db);
	return db;
};

const tableNames = async (db: Awaited<ReturnType<typeof openDb>>) => {
	const result = await db.execute(
		sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
	);
	return result.rows.map((row) => row.table_name as string).sort();
};

describe("migrations on disk", () => {
	test("the journal lists the extensions migration before init and the extensions migration creates pg_trgm", () => {
		const { entries } = readJournal(drizzleDir);
		expect(entries[0]?.tag).toBe("0000_extensions");
		expect(entries[1]?.tag).toBe("0001_init");
		const extensions = readFileSync(join(drizzleDir, "0000_extensions.sql"), "utf8");
		expect(extensions).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
	});

	test("the custom migration carries the constraints drizzle-kit cannot express and schema.ts names it", () => {
		const { entries } = readJournal(drizzleDir);
		const tag = entries[2]?.tag as string;
		expect(tag).toBeString();
		const custom = readFileSync(join(drizzleDir, `${tag}.sql`), "utf8");
		expect(custom).toMatch(/UNIQUE NULLS NOT DISTINCT\s*\(\s*"?parent_id"?\s*,\s*"?slug"?\s*\)/i);
		expect(custom).toMatch(/gin_trgm_ops/);
		expect(custom).toMatch(/setweight\(to_tsvector\('english',\s*(coalesce\()?"?title"?/i);
		expect(custom).toMatch(/setweight\(to_tsvector\('english',\s*(coalesce\()?"?body"?/i);
		const schema = readFileSync(join(import.meta.dir, "schema.ts"), "utf8");
		const mentions = schema.split(tag).length - 1;
		expect(mentions).toBeGreaterThanOrEqual(4);
	});
});

describe("migrate", () => {
	test("migrate creates every table on an empty database", async () => {
		const db = await openMigrated();
		expect(await tableNames(db)).toEqual([...tables].sort());
	});

	test("migrate is idempotent on a second boot", async () => {
		const db = await openMigrated();
		const before = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
		await migrate(db);
		const after = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
		expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
		expect(before.rows[0]?.n).toBeGreaterThanOrEqual(3);
	});

	// pg_class.reltuples is -1 on a table that ANALYZE has never seen.
	test("migrate runs ANALYZE and sets the trigram threshold", async () => {
		const db = await openMigrated();
		const threshold = await db.execute(sql`SHOW pg_trgm.word_similarity_threshold`);
		expect(Number(threshold.rows[0]?.["pg_trgm.word_similarity_threshold"])).toBe(0.4);
		const stats = await db.execute(sql`SELECT reltuples::float AS n FROM pg_class WHERE relname = 'tickets'`);
		expect(stats.rows[0]?.n).toBe(0);
	});

	// The copy appends one migration whose last statement fails. The migrator
	// runs every pending migration in one transaction, so the failure rolls
	// back the earlier migrations of the same boot too.
	test("a failing migration leaves no partial schema behind", async () => {
		const temp = mkdtempSync(join(process.env.TRELLIS_HOME as string, "migrate-"));
		cpSync(drizzleDir, temp, { recursive: true });
		const journal = readJournal(temp);
		const last = journal.entries.at(-1)!;
		const tag = `${String(last.idx + 1).padStart(4, "0")}_broken`;
		journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag });
		writeFileSync(join(temp, "meta/_journal.json"), JSON.stringify(journal));
		writeFileSync(
			join(temp, `${tag}.sql`),
			"CREATE TABLE probe_ok (id int);\n--> statement-breakpoint\nCREATE TABLE probe_ok (id int);\n",
		);

		const db = await openDb(":memory:");
		closers.push(() => db.$client.close());
		await expect(migrate(db, temp)).rejects.toThrow();
		expect(await tableNames(db)).toEqual([]);
		const applied = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
		expect(applied.rows[0]?.n).toBe(0);
	});
});
