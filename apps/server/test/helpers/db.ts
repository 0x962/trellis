import { sql } from "drizzle-orm";
import { openDb } from "../../src/db/client.ts";
import { migrate } from "../../src/db/migrate.ts";

export type TestDb = Awaited<ReturnType<typeof freshDb>>;

// One in-memory PGlite per test file, migrated once. `reset` empties every
// table in the public schema and restarts every identity, so a test starts
// from an empty database and the first activity row of a test gets id 1.
// Drizzle keeps its migration log in the `drizzle` schema, so a reset
// leaves the migrations applied.
export const freshDb = async () => {
	const db = await openDb(":memory:");
	await migrate(db);

	const reset = async () => {
		const result = await db.execute(sql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		`);
		const tables = result.rows.map((row) => sql.identifier(row.table_name as string));
		await db.execute(sql`TRUNCATE ${sql.join(tables, sql`, `)} RESTART IDENTITY CASCADE`);
	};

	const close = () => db.$client.close();

	return { db, reset, close };
};

export type DiskDb = Awaited<ReturnType<typeof diskDb>>;

// A migrated database in a directory on disk. A backup archives that
// directory, so the test that reads an archive needs the files, not the
// in-memory instance.
export const diskDb = async (dataDir: string) => {
	const db = await openDb(dataDir);
	await migrate(db);
	return { db, close: () => db.$client.close() };
};
