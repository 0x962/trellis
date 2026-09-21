import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";
import { prepareSearch } from "./queries/search.ts";

const defaultDir = join(import.meta.dir, "../../drizzle");

// The migration log lives in the `drizzle` schema, which the first
// migration run creates.
const migrationCount = async (db: Db) => {
	const found = await db.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS log`);
	if (found.rows[0]!.log === null) return 0;
	const counted = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
	return counted.rows[0]!.n as number;
};

// Applies every pending migration in one transaction, so a failing statement
// leaves the schema as it was before the boot, and returns how many it
// applied. ANALYZE gives the planner statistics for the new schema. It runs
// only when a migration applied: the statistics stay in the database across
// restarts, and an ANALYZE of 50k tickets grows the WebAssembly heap by about
// 100 MB for the life of the process. The KEY-n search functions belong to the
// session, and the instance is one session, so they hold until the process ends.
export const migrate = async (db: Db, migrationsFolder = defaultDir) => {
	const before = await migrationCount(db);
	await runMigrations(db, { migrationsFolder });
	const applied = (await migrationCount(db)) - before;
	if (applied > 0) await db.execute(sql`ANALYZE`);
	await prepareSearch(db);
	return applied;
};
