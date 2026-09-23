import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { prepareSearch } from "./queries/search.ts";

// A PGlite instance that starts on an empty directory builds a new Postgres
// database, and `migrate` then applies every file in `apps/server/drizzle`.
// Together they take about 3.4 seconds, and a test setup hook stops after
// five seconds. This module runs them one time, keeps the result as a tar of
// the data directory, and starts every test database from that tar in about
// 0.2 seconds.

const serverDir = join(import.meta.dir, "../..");
const migrationsDir = join(serverDir, "drizzle");

// The tar takes 44 MB. It lives under the temporary directory of the machine,
// because this machine holds hundreds of checkouts of this repository and each
// one runs these tests. The key in the file name covers the schema, so every
// checkout with the same migrations reads one file, and the operating system
// removes the directory.
const cacheDir = join(tmpdir(), "trellis-testdb");

const tarPath = (key: string) => join(cacheDir, `testDb-${key}.tar`);

// The key names the stored tar, and it covers every input that decides the
// schema inside the tar. `drizzle/meta/_journal.json` holds the `when` value
// of each migration, and Drizzle reads those values to choose which files it
// applies and in which order. `migrate.ts` holds the code that applies them.
// `package.json` pins the PGlite version, and a data directory belongs to the
// Postgres version that wrote it.
const schemaKey = async () => {
	const manifest = JSON.parse(await readFile(join(serverDir, "package.json"), "utf8"));
	const hash = createHash("sha256");
	hash.update(manifest.dependencies["@electric-sql/pglite"]);
	hash.update(await readFile(join(import.meta.dir, "migrate.ts")));
	hash.update(await readFile(join(migrationsDir, "meta/_journal.json")));
	for (const name of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
		hash.update(name);
		hash.update(await readFile(join(migrationsDir, name)));
	}
	return hash.digest("hex").slice(0, 16);
};

const buildTar = async () => {
	const db = await openDb(":memory:");
	await migrate(db);
	const tar = await db.$client.dumpDataDir("none");
	await db.$client.close();
	return Buffer.from(await tar.arrayBuffer());
};

// Several test processes run at the same time, and they run from different
// checkouts. Each one writes a file with its own process id in the name, and
// then renames that file to `testDb-<key>.tar`. A rename inside one directory
// happens in one step, so another process always reads a complete tar. No
// process removes the tar of another key, because that key belongs to another
// checkout that still reads it.
const storeTar = async (key: string, tar: Buffer) => {
	await mkdir(cacheDir, { recursive: true });
	const ownTarPath = join(cacheDir, `testDb-${key}.${process.pid}.tmp`);
	await writeFile(ownTarPath, tar);
	await rename(ownTarPath, tarPath(key));
};

// The first call on a new key takes about 3.4 seconds, because it builds the
// tar and writes it. The read fails when no process built the tar yet, and a
// failed read builds it.
const loadMigratedTar = async () => {
	const key = await schemaKey();
	const stored = await readFile(tarPath(key)).catch(() => undefined);
	if (stored !== undefined) return new Blob([stored]);
	const built = await buildTar();
	await storeTar(key, built);
	return new Blob([built]);
};

let migratedTar: Promise<Blob> | undefined;

// `scripts/testPreload.ts` calls this before a test file runs. The build of
// the tar takes about 2 seconds, and a `beforeAll` hook stops after 5 seconds,
// so the build must end before the first hook starts.
export const primeTestDb = () => {
	migratedTar ??= loadMigratedTar();
	return migratedTar;
};

// A file that holds no PGlite data directory gives an empty database, because
// PGlite runs initdb when it finds no database in the file it unpacked. The
// `tickets` table proves that the file held the migrated database, and the
// error names the file that a person must delete. Every other checkout on the
// machine writes into the same directory, so the file can come from another
// process.
// `prepareSearch` creates the search view and the search functions under
// `pg_temp`. Postgres keeps them in the session and writes them to no file,
// so the tar holds none of them and `openTestDb` must call `prepareSearch`
// for each new database.
export const openTestDb = async () => {
	const db = await openDb(":memory:", await primeTestDb());
	const tables = await db.execute(sql`SELECT to_regclass('tickets') AS tickets`);
	if (tables.rows[0]!.tickets === null) throw new Error(`No schema in ${tarPath(await schemaKey())}`);
	await prepareSearch(db);
	return db;
};
