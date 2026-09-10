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

// APFS and btrfs copy a file by reference, so a copy of a 50k home costs no
// disk and almost no time. Every test gets its own copy, because a server
// writes to its home and holds a lock on it.
const copyArgs = process.platform === "darwin" ? ["cp", "-cR"] : ["cp", "-R", "--reflink=auto"];

export const perfHome = async () => {
	const source = await seededHome();
	const home = join(freshHome(), "home");
	const proc = Bun.spawn([...copyArgs, source, home], { stdout: "ignore", stderr: "pipe" });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`copy of the perf home exited ${code}: ${await new Response(proc.stderr).text()}`);
	return home;
};
