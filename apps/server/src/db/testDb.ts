import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { prepareSearch } from "./queries/search.ts";

// A PGlite instance that starts on an empty directory builds a new Postgres
// database, and `migrate` then applies every file in `apps/server/drizzle`.
// Together they cost about 3.4 seconds, and a test file that pays them in a
// setup hook passes the five second limit of the hook. This module pays them
// one time, keeps the result as a tar of the data directory, and starts every
// test database from that tar in about 0.2 seconds. The time no longer follows
// the number of migration files.

const serverDir = join(import.meta.dir, "../..");
const migrationsDir = join(serverDir, "drizzle");
const cacheDir = join(serverDir, ".cache");

const templatePath = (key: string) => join(cacheDir, `testDb-${key}.tar`);

// The key names the stored tar. It covers each migration file, because a new
// or an edited file gives a different schema. It covers the pinned PGlite
// version, because a data directory belongs to the Postgres version that
// wrote it.
const templateKey = async () => {
	const manifest = JSON.parse(await readFile(join(serverDir, "package.json"), "utf8"));
	const hash = createHash("sha256");
	hash.update(manifest.dependencies["@electric-sql/pglite"]);
	for (const name of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
		hash.update(name);
		hash.update(await readFile(join(migrationsDir, name)));
	}
	return hash.digest("hex").slice(0, 16);
};

const buildTemplate = async () => {
	const db = await openDb(":memory:");
	await migrate(db);
	const tar = await db.$client.dumpDataDir("none");
	await db.$client.close();
	return Buffer.from(await tar.arrayBuffer());
};

// Several test processes run at the same time. Each one writes its own file
// and then renames it onto the name that the key gives, and a rename inside
// one directory replaces the name in one step. A reader therefore reads a
// whole tar. The sweep removes the tar of an earlier key, which is 44 MB.
const storeTemplate = async (key: string, tar: Buffer) => {
	await mkdir(cacheDir, { recursive: true });
	const own = join(cacheDir, `testDb-${key}.${process.pid}.tmp`);
	await writeFile(own, tar);
	await rename(own, templatePath(key));
	for (const name of await readdir(cacheDir)) {
		if (name.endsWith(".tar") && name !== `testDb-${key}.tar`) await rm(join(cacheDir, name));
	}
};

const readTemplate = async () => {
	const key = await templateKey();
	if (existsSync(templatePath(key))) return new Blob([await readFile(templatePath(key))]);
	const built = await buildTemplate();
	await storeTemplate(key, built);
	return new Blob([built]);
};

let template: Promise<Blob> | undefined;

// `prepareSearch` creates the search view and the search functions under
// `pg_temp`. Postgres holds them in the session and writes them to no data
// directory, so the tar carries none of them and each new database needs the
// call.
export const openTestDb = async () => {
	template ??= readTemplate();
	const db = await openDb(":memory:", await template);
	await prepareSearch(db);
	return db;
};
