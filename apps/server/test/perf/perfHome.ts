import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase } from "../../src/db/open.ts";
import { freshHome } from "../helpers/home.ts";
import { PERF_ROWS, perfSeed } from "./seed.ts";

// A data home that holds the deterministic seed of `PERF_ROWS` tickets. The
// seed takes minutes at 50k, so it is built once under `apps/server/.cache`
// and every run copies it. The cache key hashes the seed and the migrations,
// so a change to either builds a new home.

const serverDir = join(import.meta.dir, "..", "..");
const cacheDir = join(serverDir, ".cache", "perf");

const keyFiles = () => {
	const migrations = join(serverDir, "drizzle");
	return [
		join(import.meta.dir, "seed.ts"),
		join(serverDir, "test", "fixtures", "projects.ts"),
		...readdirSync(migrations)
			.filter((name) => name.endsWith(".sql"))
			.sort()
			.map((name) => join(migrations, name)),
	];
};

const cacheKey = () => {
	const hasher = new Bun.CryptoHasher("sha256");
	for (const file of keyFiles()) hasher.update(readFileSync(file));
	return hasher.digest("hex").slice(0, 16);
};

// The build writes into a directory of its own and renames it at the end, so
// a build that stops halfway never looks like a finished home.
const build = async (dir: string) => {
	const staging = `${dir}.building-${process.pid}`;
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(join(staging, "attachments", "tmp"), { recursive: true });
	const database = await openDatabase(join(staging, "db"));
	await perfSeed(database.db, PERF_ROWS);
	for (const table of ["tickets", "activity", "comments"]) {
		await database.db.execute(sql.raw(`VACUUM (ANALYZE) ${table}`));
	}
	await database.db.execute(sql`CHECKPOINT`);
	await database.close();
	renameSync(staging, dir);
};

let built: Promise<string> | undefined;

// The path of the cached home for this run, built on the first call.
export const seededHome = () => {
	built ??= (async () => {
		const dir = join(cacheDir, `${PERF_ROWS}-${cacheKey()}`);
		if (!existsSync(dir)) await build(dir);
		return dir;
	})();
	return built;
};

// Every test gets its own copy of the seeded home, because a server writes
// to its home and holds a lock on it.
//
// APFS and btrfs copy a file by reference, which costs no disk and almost no
// time, but the copy then shares every block with its source. The first
// write to a shared block makes the file system allocate a block and copy
// it, and the write waits for that. A server on such a home pays the cost on
// its first writes, and the write budgets then measure the file system
// instead of trellis. The data home of a person is not a copy and never pays
// it. Measured at 50k rows: a home copied by reference answers its first
// write in 13 ms and spikes to 30 ms inside the first 35 writes; a home with
// blocks of its own answers in 3 ms and stays under 6 ms.
//
// So the Postgres data files get blocks of their own. They are 433 MB of the
// 1.1 GB home. The write-ahead log is the other 672 MB, and a copy by
// reference costs nothing there, because a write to the log appends and an
// appended block is new. `pg_wal` is the one directory the copy shares.
const cloneArgs = process.platform === "darwin" ? ["cp", "-cR"] : ["cp", "-R", "--reflink=auto"];

const SHARED = "pg_wal";

const copy = async (args: string[], source: string, target: string) => {
	const proc = Bun.spawn([...args, source, target], { stdout: "ignore", stderr: "pipe" });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`copy of ${source} exited ${code}: ${await new Response(proc.stderr).text()}`);
};

export const perfHome = async () => {
	const source = await seededHome();
	const home = join(freshHome(), "home");
	await copy(cloneArgs, source, home);
	for (const entry of readdirSync(join(source, "db"))) {
		if (entry === SHARED) continue;
		rmSync(join(home, "db", entry), { recursive: true, force: true });
		await copy(["cp", "-R"], join(source, "db", entry), join(home, "db", entry));
	}
	return home;
};
