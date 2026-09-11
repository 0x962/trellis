import { sql } from "drizzle-orm";
import type { TestDb } from "../../../server/test/helpers/db.ts";

// A snapshot is every row of the seeded database as JSON. The seed runs
// through the services once; every test after it restores the rows, which
// costs one statement per table instead of a hundred service calls.

export type Db = TestDb["db"];

// The order is the order a restore inserts in, so a foreign key always finds
// the row it names.
const TABLES = [
	"actors",
	"settings",
	"projects",
	"repos",
	"statuses",
	"personas",
	"tickets",
	"comments",
	"attachments",
	"pull_requests",
	"ticket_pull_requests",
	"activity",
	"agent_sessions",
	"agent_cursors",
	"agent_runs",
] as const;

export type Snapshot = {
	// The rows of each table, keyed by the table name.
	tables: Record<string, unknown[]>;
	// The next value of the activity id sequence.
	nextActivityId: number;
};

type ColumnRow = { column_name: string; is_generated: string; data_type: string };

type Columns = { stored: string[]; instants: string[] };

const columnCache = new Map<string, Columns>();

// The columns a row carries. A generated column is computed from the others,
// so an INSERT never names it. `instants` are the timestamp columns a restore
// shifts. The schema is the same in every test process, so each table is read
// once.
const columnsOf = async (db: Db, table: string): Promise<Columns> => {
	const held = columnCache.get(table);
	if (held !== undefined) return held;
	const found = await db.execute(sql`
		SELECT column_name, is_generated, data_type FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = ${table}
		ORDER BY ordinal_position
	`);
	const kept = (found.rows as ColumnRow[]).filter((column) => column.is_generated === "NEVER");
	const columns: Columns = {
		stored: kept.map((column) => column.column_name),
		instants: kept.filter((column) => column.data_type.startsWith("timestamp")).map((column) => column.column_name),
	};
	columnCache.set(table, columns);
	return columns;
};

const storedColumns = async (db: Db, table: string) => (await columnsOf(db, table)).stored;

export const capture = async (db: Db): Promise<Snapshot> => {
	const tables: Record<string, unknown[]> = {};
	for (const table of TABLES) {
		const columns = await storedColumns(db, table);
		const projection = sql.join(
			columns.map((column) => sql`${sql.raw(`'${column}'`)}, t.${sql.identifier(column)}`),
			sql`, `,
		);
		const found = await db.execute(
			sql`SELECT jsonb_build_object(${projection}) AS row FROM ${sql.identifier(table)} t`,
		);
		tables[table] = found.rows.map((row) => row.row);
	}
	const found = await db.execute(sql`SELECT coalesce(max(id), 0)::int + 1 AS next FROM activity`);
	return { tables, nextActivityId: (found.rows[0] as { next: number }).next };
};

// Moves every instant of a row forward by `shift` milliseconds. The seed
// describes ages, such as "two hours before now", so a snapshot built
// yesterday still reads as those ages today.
const shifted = (rows: unknown[], instants: string[], shift: number) => {
	if (shift === 0) return rows;
	return rows.map((row) => {
		const copy = { ...(row as Record<string, unknown>) };
		for (const column of instants) {
			const value = copy[column];
			if (typeof value === "string") copy[column] = new Date(Date.parse(value) + shift).toISOString();
		}
		return copy;
	});
};

// Empties every table and writes the snapshot back with every instant moved
// forward by `shift`. One statement per table expands the JSON array into
// rows of the table's own type, so every column keeps the type the schema
// gives it.
export const restore = async (db: Db, snapshot: Snapshot, shift = 0) => {
	const names = TABLES.map((table) => sql.identifier(table));
	await db.execute(sql`TRUNCATE ${sql.join(names, sql`, `)} RESTART IDENTITY CASCADE`);
	for (const table of TABLES) {
		const rows = snapshot.tables[table] ?? [];
		if (rows.length === 0) continue;
		const { stored, instants } = await columnsOf(db, table);
		const list = sql.join(
			stored.map((column) => sql.identifier(column)),
			sql`, `,
		);
		const json = JSON.stringify(shifted(rows, instants, shift));
		// `activity.id` is GENERATED ALWAYS, and a restore keeps the ids the
		// seed handed out, because a timeline entry is addressed by its id.
		await db.execute(sql`
			INSERT INTO ${sql.identifier(table)} (${list}) OVERRIDING SYSTEM VALUE
			SELECT ${list} FROM jsonb_populate_recordset(null::${sql.identifier(table)}, ${json}::jsonb)
		`);
	}
	await db.execute(sql`SELECT setval(pg_get_serial_sequence('activity', 'id'), ${snapshot.nextActivityId}, false)`);
};
