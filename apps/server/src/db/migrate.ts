import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";

const defaultDir = join(import.meta.dir, "../../drizzle");

// The migration log lives in the `drizzle` schema, which the first
// migration run creates.
const migrationCount = async (db: Db) => {
	const found = await db.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS log`);
	if (found.rows[0]!.log === null) return 0;
	const counted = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
	return counted.rows[0]!.n as number;
};

// `word <% title` holds when the word similarity of the word and the title
// is at least this value. A search that compares word_similarity itself
// uses the same value.
export const WORD_SIMILARITY_THRESHOLD = 0.4;

// Applies every pending migration in one transaction, so a failing statement
// leaves the schema as it was before the boot, and returns how many it
// applied. ANALYZE gives the planner statistics for the new schema. It runs
// only when a migration applied: the statistics stay in the database across
// restarts, and an ANALYZE of 50k tickets grows the WebAssembly heap by about
// 100 MB for the life of the process. The trigram threshold is a session
// setting, and the instance is one session, so it holds until the process
// ends.
export const migrate = async (db: Db, migrationsFolder = defaultDir) => {
	const before = await migrationCount(db);
	await runMigrations(db, { migrationsFolder });
	const applied = (await migrationCount(db)) - before;
	if (applied > 0) await db.execute(sql`ANALYZE`);
	await db.execute(sql`SET pg_trgm.word_similarity_threshold = ${sql.raw(String(WORD_SIMILARITY_THRESHOLD))}`);
	return applied;
};
