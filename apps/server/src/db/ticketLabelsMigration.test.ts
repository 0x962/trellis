import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "./client.ts";

// Migration 0077 drops the two label tables and creates the three new ones.
// It runs on three databases: one that never ran 0067_project_labels, one
// that ran it and holds rows in the old shape, and a database created after
// this migration. The three end with the same tables.

const migrationsDir = join(import.meta.dir, "../../drizzle");

const migrationFiles = () =>
	readdirSync(migrationsDir)
		.filter((name) => /^\d{4}.*\.sql$/.test(name))
		.sort();

const apply = async (db: Db, names: string[]) => {
	for (const name of names) await db.$client.exec(readFileSync(join(migrationsDir, name), "utf8"));
};

const index = (name: string) => Number(name.slice(0, 4));

// The columns, the constraints, and the indexes of the three label tables, as
// one string per database. Two databases with the same string hold the same
// tables.
const catalog = async (db: Db) => {
	const tables = sql`('label_groups', 'labels', 'ticket_labels')`;
	const columns = await db.execute(sql`
		SELECT table_name, column_name, data_type, is_nullable, column_default
		FROM information_schema.columns WHERE table_name IN ${tables}
		ORDER BY table_name, ordinal_position`);
	const constraints = await db.execute(sql`
		SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
		FROM pg_constraint WHERE conrelid::regclass::text IN ${tables} ORDER BY 1, 2`);
	const indexes = await db.execute(sql`
		SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename IN ${tables} ORDER BY 1, 2`);
	return JSON.stringify({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows });
};

const rowCounts = async (db: Db) => {
	const found = await db.execute(sql`
		SELECT (SELECT count(*)::int FROM label_groups) AS groups,
			(SELECT count(*)::int FROM labels) AS labels,
			(SELECT count(*)::int FROM ticket_labels) AS ticket_labels`);
	return found.rows[0];
};

test("migration 0077 ends with the same label tables on the three database shapes", async () => {
	const files = migrationFiles();
	const before0077 = files.filter((name) => index(name) < 77);
	const only0077 = files.filter((name) => index(name) === 77);

	// The database of an install that skipped 0067, so it has no label table
	// until 0076 creates one.
	const skipped = await openDb(":memory:");
	// The database of an install that ran 0067 and holds a group and a label
	// in the old shape.
	const kept = await openDb(":memory:");
	// A database created after this migration, in one pass.
	const fresh = await openDb(":memory:");
	try {
		await apply(
			skipped,
			before0077.filter((name) => index(name) !== 67),
		);
		await apply(skipped, only0077);

		await apply(kept, before0077);
		await kept.$client.exec(`
			INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
			VALUES ('p1', 'p1', 'PRJ', 'prj', 'Project', now(), now());
			INSERT INTO label_groups (id, project_id, name, position, created_at, updated_at)
			VALUES ('g1', 'p1', 'Type', 0, now(), now());
			INSERT INTO labels (id, group_id, name, color, position, created_at, updated_at)
			VALUES ('l1', 'g1', 'Bug', 'danger', 0, now(), now());
		`);
		await apply(kept, only0077);

		await apply(fresh, files);

		const empty = { groups: 0, labels: 0, ticket_labels: 0 };
		expect(await rowCounts(skipped)).toEqual(empty);
		expect(await rowCounts(kept)).toEqual(empty);
		expect(await rowCounts(fresh)).toEqual(empty);

		const shape = await catalog(fresh);
		expect(await catalog(skipped)).toBe(shape);
		expect(await catalog(kept)).toBe(shape);
		expect(shape).toContain("labels_project_id_name_unique");
		expect(shape).toContain("ticket_labels_pkey");
	} finally {
		await skipped.$client.close();
		await kept.$client.close();
		await fresh.$client.close();
	}
}, 120_000);
