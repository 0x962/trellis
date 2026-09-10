import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// The migration log lives in the `drizzle` schema, which the first
// migration run creates.
const migrationCount = async (db: Awaited<ReturnType<typeof openDb>>) => {
	const found = await db.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS log`);
	if (found.rows[0]!.log === null) return 0;
	const counted = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
	return counted.rows[0]!.n as number;
};

// Opens the database of a data home and brings its schema up to date.
// `applied` is the number of migrations this open ran. `liveShas` are the
// hashes an attachment row still names, which the blob sweep keeps.
export const openDatabase = async (dataDir: string) => {
	const db = await openDb(dataDir);
	const before = await migrationCount(db);
	await migrate(db);
	const applied = (await migrationCount(db)) - before;
	const liveShas = async () => {
		const found = await db.execute(sql`SELECT DISTINCT sha256 FROM attachments`);
		return found.rows.map((row) => row.sha256 as string);
	};
	return { db, applied, liveShas, close: () => db.$client.close() };
};
