import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";

const defaultDir = join(import.meta.dir, "../../drizzle");

// Applies every pending migration in one transaction, so a failing statement
// leaves the schema as it was before the boot. ANALYZE gives the planner
// statistics on a fresh or restored database; PGlite runs no autovacuum, so
// nothing else collects them. The trigram threshold is a session setting,
// and the instance is one session, so it holds until the process ends.
export const migrate = async (db: Db, migrationsFolder = defaultDir) => {
	await runMigrations(db, { migrationsFolder });
	await db.execute(sql`ANALYZE`);
	await db.execute(sql`SET pg_trgm.word_similarity_threshold = 0.4`);
};
