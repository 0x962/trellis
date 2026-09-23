import { PGlite, types } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PgDatabase, PgPreparedQuery } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema.ts";

// Drizzle wraps every driver error in a DrizzleQueryError whose message is
// the query text and whose `cause` is the Postgres error. A service maps a
// failure by the Postgres `code` and `constraint`, and a test matches the
// Postgres message, so the driver error is rethrown as it is. The Postgres
// error still carries the query text and the parameters.
type QueryRunner = {
	queryWithCache: (queryString: string, params: unknown[], query: () => Promise<unknown>) => Promise<unknown>;
};
(PgPreparedQuery.prototype as unknown as QueryRunner).queryWithCache = (_queryString, _params, query) => query();

// `execute` returns a PgRaw: a thenable that runs the query when awaited and
// is not a Promise. Wrapped in a Promise, the query starts at the call and
// `Promise.all` and `expect(...).rejects` accept the result.
const executeRaw = PgDatabase.prototype.execute;
PgDatabase.prototype.execute = function execute(query) {
	return Promise.resolve(executeRaw.call(this, query)) as ReturnType<typeof executeRaw>;
};

// Opens the one PGlite instance the server runs on. `:memory:` gives a
// database that lives as long as the process; a directory persists it.
// pg_trgm is the one extension; the migration 0000_extensions creates it.
// A bigint column arrives as a JavaScript number: every activity id stays
// far below 2^53, and JSON cannot carry a BigInt.
// `shared_buffers` is the Postgres page cache. It lives in the WebAssembly
// memory and stays resident for the life of the process. At 16 MB the idle
// server sits at its 350 MB budget after a first boot; 8 MB keeps it about
// 7 MB under. The operating system file cache still holds the data files,
// so the 10k perf suite keeps its latency budgets at 8 MB.
// `loadDataDir` is a tar of a PGlite data directory, as `dumpDataDir` writes
// it. PGlite unpacks the tar into the data directory and starts on it, so it
// builds no new database of its own.
export const openDb = async (dataDir: string, loadDataDir?: Blob) => {
	const client = await PGlite.create({
		dataDir: dataDir === ":memory:" ? "memory://" : dataDir,
		loadDataDir,
		startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=8MB"],
		extensions: { pg_trgm },
		parsers: { [types.INT8]: (value: string) => Number(value) },
	});
	return drizzle({ client, schema });
};

export type Db = Awaited<ReturnType<typeof openDb>>;
