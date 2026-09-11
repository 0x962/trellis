import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../../../server/test/helpers/app.ts";
import { freshDb } from "../../../server/test/helpers/db.ts";
import { ghStub } from "../../../server/test/helpers/gh-stub.ts";
import { seedData } from "./seed/index.ts";
import { capture, type Snapshot } from "./snapshot.ts";

// The seed runs through the services once and its rows are kept as JSON. A
// build takes seconds, so it is written under apps/web/.cache and every later
// run reads it. The cache key hashes the seed sources and the migrations, so
// a change to either builds a new file.

const webDir = join(import.meta.dir, "..", "..");
const serverDir = join(webDir, "..", "server");
const cacheDir = join(webDir, ".cache", "seed");

// A snapshot holds the instants the seed wrote. A restore shifts them, so
// `base` travels with the rows.
export type SeedFile = Snapshot & { base: number };

const keyFiles = () => {
	const seedDir = join(import.meta.dir, "seed");
	const migrations = join(serverDir, "drizzle");
	return [
		...["index.ts", "support.ts", "fillers.ts", "namedCde.ts", "namedOthers.ts"].map((name) => join(seedDir, name)),
		join(import.meta.dir, "snapshot.ts"),
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

// Seeds one throwaway server and keeps every row it wrote.
const build = async (): Promise<SeedFile> => {
	const base = Date.now();
	const stubDir = mkdtempSync(join(process.env.TRELLIS_HOME as string, "seed-gh-"));
	const gh = ghStub(stubDir, {});
	const h = await freshDb();
	const app = await createTestApp({ db: h });
	try {
		await seedData({ transport: app.transport, gh, base });
		return { ...(await capture(h.db)), base };
	} finally {
		gh.restore();
		await app.close();
		h.close();
		rmSync(stubDir, { recursive: true, force: true });
	}
};

let held: Promise<SeedFile> | undefined;

// The seed of this test process. The first caller builds it or reads the
// cache file; every caller after it gets the same rows.
export const seedSnapshot = () => {
	held ??= (async () => {
		const file = join(cacheDir, `${cacheKey()}.json`);
		if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as SeedFile;
		const snapshot = await build();
		mkdirSync(cacheDir, { recursive: true });
		// A build writes its own file and renames it, so a second process never
		// reads a file that stopped halfway.
		const staging = `${file}.building-${process.pid}`;
		writeFileSync(staging, JSON.stringify(snapshot));
		renameSync(staging, file);
		return snapshot;
	})();
	return held;
};
