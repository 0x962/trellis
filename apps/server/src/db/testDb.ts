import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { prepareSearch } from "./queries/search.ts";

// A PGlite instance that starts on an empty directory builds a new Postgres
// database, and `migrate` then applies every file in `apps/server/drizzle`.
// This module runs them one time, keeps the result as a tar of the data
// directory, and starts every test database from that tar.

const serverDir = join(import.meta.dir, "../..");
const migrationsDir = join(serverDir, "drizzle");

// The tar takes 44 MB. It lives under the temporary directory, because many
// checkouts of this repository can run these tests at the same time. The key
// in the file name covers the schema, so every checkout with the same
// migrations reads one file.
const cacheDir = join(tmpdir(), "trellis-testdb");

const tarPath = (key: string) => join(cacheDir, `testDb-${key}.tar`);

// A tar that no test read for this long belongs to a schema that no checkout
// runs any more. Each merged migration gives a new key and a new 44 MB file,
// so without this rule the directory grows for ever.
const UNREAD_MS = 24 * 60 * 60 * 1000;

// The key names the stored tar. Every input that decides what the data
// directory holds goes into it. `drizzle/meta/_journal.json` holds the `when`
// value of each migration, and Drizzle reads those values to choose which
// files it applies and in which order. `migrate.ts` applies them, and
// `client.ts` sets the extensions and the start params of the instance. The
// pinned versions of `pglite` and `drizzle-orm` decide the file format and
// the bookkeeping rows, so the whole dependency list goes in.
const schemaKey = async () => {
	const manifest = JSON.parse(await readFile(join(serverDir, "package.json"), "utf8"));
	const hash = createHash("sha256");
	hash.update(JSON.stringify(manifest.dependencies));
	hash.update(await readFile(join(import.meta.dir, "client.ts")));
	hash.update(await readFile(join(import.meta.dir, "migrate.ts")));
	hash.update(await readFile(join(migrationsDir, "meta/_journal.json")));
	for (const name of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
		hash.update(name);
		hash.update(await readFile(join(migrationsDir, name)));
	}
	return hash.digest("hex").slice(0, 16);
};

// Drizzle runs a `.sql` file only when `_journal.json` names it. A hand
// written file, or a merge that keeps one side of the journal, gives a tar
// without that table, and every test that reads the table then fails with a
// reason that points at the test. The three counts must agree.
const buildTar = async () => {
	const db = await openDb(":memory:");
	const applied = await migrate(db);
	const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8"));
	const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).length;
	if (applied !== journal.entries.length || applied !== files)
		throw new Error(
			`${applied} migrations ran, the journal names ${journal.entries.length}, the folder holds ${files}`,
		);
	const tar = await db.$client.dumpDataDir("none");
	await db.$client.close();
	return Buffer.from(await tar.arrayBuffer());
};

// A rename inside one directory happens in one step, so another process
// always reads a complete tar. The loop then removes a tar that no test
// opened for `UNREAD_MS`, and it keeps every other one, because another
// checkout with another schema reads that file. A removal costs that
// checkout one build.
const storeTar = async (key: string, tar: Buffer) => {
	await mkdir(cacheDir, { recursive: true });
	const ownTarPath = join(cacheDir, `testDb-${key}.${process.pid}.tmp`);
	await writeFile(ownTarPath, tar);
	await rename(ownTarPath, tarPath(key));
	const oldest = Date.now() - UNREAD_MS;
	for (const name of await readdir(cacheDir)) {
		if (name === `testDb-${key}.tar` || !name.startsWith("testDb-")) continue;
		if ((await stat(join(cacheDir, name))).mtimeMs < oldest) await rm(join(cacheDir, name));
	}
};

// The touch of the modification time records the read, because `storeTar`
// removes the files that no test opened for a day.
const readTar = async (key: string) => {
	const stored = await readFile(tarPath(key)).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return undefined;
		throw error;
	});
	if (stored === undefined) return undefined;
	const now = new Date();
	await utimes(tarPath(key), now, now);
	return stored;
};

const loadTar = async () => {
	const key = await schemaKey();
	const stored = await readTar(key);
	if (stored !== undefined) return new Blob([stored]);
	const built = await buildTar();
	await storeTar(key, built);
	return new Blob([built]);
};

let cached: Promise<Blob> | undefined;

// The tar of the migrated database, built on the first call of the process.
// That build takes about 3.5 seconds, and a setup hook stops after five
// seconds, so `apps/server/scripts/testPreload.ts` calls this before bun runs
// the first test file.
export const migratedTar = () => (cached ??= loadTar());

// PGlite builds a new empty database when it finds no database in the file it
// unpacked, and it reports no error. Another checkout can write the file at
// this path, so the `tickets` table proves that the file held the migrated
// database, and the message names the file that a person must remove.
const requireSchema = async (db: Awaited<ReturnType<typeof openDb>>) => {
	const found = await db.execute(sql`SELECT to_regclass('tickets') AS tickets`);
	if (found.rows[0]!.tickets === null) throw new Error(`No schema in ${tarPath(await schemaKey())}`);
};

// `prepareSearch` creates the search view and the search functions under
// `pg_temp`. Postgres keeps them in the session and writes them to no file,
// so the tar holds none of them and each new database needs the call.
export const openTestDb = async () => {
	const db = await openDb(":memory:", await migratedTar());
	await requireSchema(db);
	await prepareSearch(db);
	return db;
};
