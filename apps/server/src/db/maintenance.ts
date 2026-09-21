import { type SQL, sql } from "drizzle-orm";

type Executor = { execute(query: SQL): Promise<unknown> };

export const VACUUM_AFTER_WRITES = 1000;

// The tables a write touches most. PGlite runs no autovacuum, so dead
// tuples and stale statistics stay until this runs.
const VACUUMED_TABLES = ["tickets", "activity"] as const;

// Counts writes and vacuums the busy tables once more than 1000 writes have
// happened since the last run. `tick` is what the periodic timer calls;
// `runNow` is for after a backup or a restore. VACUUM cannot run inside a
// transaction, so both take the database and not a tx.
export const createMaintenance = (db: Executor) => {
	let pendingWrites = 0;

	const recordWrites = (count: number) => {
		pendingWrites += count;
	};

	const runNow = async () => {
		for (const table of VACUUMED_TABLES) {
			await db.execute(sql.raw(`VACUUM (ANALYZE) ${table}`));
		}
		pendingWrites = 0;
	};

	const tick = async () => {
		if (pendingWrites > VACUUM_AFTER_WRITES) await runNow();
	};

	return {
		recordWrites,
		tick,
		runNow,
		get pendingWrites() {
			return pendingWrites;
		},
	};
};
