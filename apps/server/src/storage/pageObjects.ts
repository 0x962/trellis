import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ulid } from "ulid";
import { hashFile, shardedHashPath, withHashLock } from "./hashStore.ts";

const PAGES_DIR = "pages";
const PAGE_OBJECTS_DIR = "objects";
const PAGE_TEMP_DIR = "tmp";

const pagesDir = (home: string) => join(home, PAGES_DIR);

const pageObjectsDir = (home: string) => join(pagesDir(home), PAGE_OBJECTS_DIR);

const pageTempDir = (home: string) => join(pagesDir(home), PAGE_TEMP_DIR);

export const pageTempPath = (home: string, stageId: string) => join(pageTempDir(home), stageId);

export const pageObjectPath = (home: string, sha256: string) => shardedHashPath(pageObjectsDir(home), sha256);

type Release = () => void;

const activeStages = new Map<string, number>();
export const PAGE_STAGE_TTL_MS = 24 * 60 * 60 * 1000;

const liveHashes = new Map<string, number>();
type HolderCheck = { stale: boolean; release: Release };

const holderChecks = new Map<string, Set<HolderCheck>>();

const markHolderChecksStale = (sha256: string) => {
	for (const check of holderChecks.get(sha256) ?? []) check.stale = true;
};

const retainHash = (sha256: string): Release => {
	markHolderChecksStale(sha256);
	liveHashes.set(sha256, (liveHashes.get(sha256) ?? 0) + 1);
	return () => {
		const remaining = liveHashes.get(sha256)! - 1;
		if (remaining === 0) liveHashes.delete(sha256);
		else liveHashes.set(sha256, remaining);
	};
};

const startHolderCheck = (sha256: string) => {
	const check: HolderCheck = {
		stale: false,
		release: () => {
			checks.delete(check);
			if (checks.size === 0) holderChecks.delete(sha256);
		},
	};
	const checks = holderChecks.get(sha256) ?? new Set();
	checks.add(check);
	holderChecks.set(sha256, checks);
	return check;
};

export type StagedPageObject = {
	stageId: string;
	sha256: string;
	size: number;
};

type FinalizedPageObject = {
	path: string;
	releaseHash: Release;
};

export const stagePageObject = async (
	home: string,
	file: File,
	maxBytes = Number.POSITIVE_INFINITY,
): Promise<StagedPageObject | null> => {
	const stageId = ulid();
	const path = pageTempPath(home, stageId);
	activeStages.set(path, Number.POSITIVE_INFINITY);
	await mkdir(pageTempDir(home), { recursive: true });
	const sink = Bun.file(path).writer();
	try {
		const stored = await hashFile(
			file,
			(chunk) => {
				sink.write(chunk);
			},
			maxBytes,
		);
		await sink.end();
		if ("limitExceeded" in stored) {
			await unlink(path);
			activeStages.delete(path);
			return null;
		}
		activeStages.set(path, Date.now() + PAGE_STAGE_TTL_MS);
		return { stageId, ...stored };
	} catch (error) {
		try {
			await sink.end();
		} finally {
			await rm(path, { force: true });
			activeStages.delete(path);
		}
		throw error;
	}
};

export const discardPageObject = async (home: string, staged: StagedPageObject) => {
	const path = pageTempPath(home, staged.stageId);
	await rm(path, { force: true });
	activeStages.delete(path);
};

// `finalizePageObject` calls `retainHash` before it waits for the object lock.
// The caller invokes `releaseHash` after it writes the database row.
export const finalizePageObject = async (home: string, staged: StagedPageObject): Promise<FinalizedPageObject> => {
	const releaseHash = retainHash(staged.sha256);
	let finalized = false;
	try {
		const path = pageObjectPath(home, staged.sha256);
		await withHashLock(path, async () => {
			const source = pageTempPath(home, staged.stageId);
			if (existsSync(path)) await unlink(source);
			else {
				await mkdir(dirname(path), { recursive: true });
				await rename(source, path);
			}
		});
		activeStages.delete(pageTempPath(home, staged.stageId));
		finalized = true;
		return { path, releaseHash };
	} finally {
		if (!finalized) releaseHash();
	}
};

// `removePageObject` asks `holdsSha` if a database row still uses this hash. It
// asks before it waits for the hash lock.
// `retainHash` marks each earlier answer as out of date, so an answer from
// before a new `finalizePageObject` cannot delete the new file.
const removePageObject = async (home: string, sha256: string, holdsSha: () => Promise<boolean>) => {
	const check = startHolderCheck(sha256);
	try {
		if (await holdsSha()) return false;
		return withHashLock(pageObjectPath(home, sha256), async () => {
			if (liveHashes.has(sha256) || check.stale || !existsSync(pageObjectPath(home, sha256))) return false;
			await unlink(pageObjectPath(home, sha256));
			markHolderChecksStale(sha256);
			return true;
		});
	} finally {
		check.release();
	}
};

// `holdsSha` must ask the database at each call. A list of used hashes that the
// caller made earlier can miss a row that another transaction writes while
// `gcPageObjects` waits for the hash lock.
export const gcPageObjects = async (
	home: string,
	sha256s: string[],
	holdsSha: (sha256: string) => Promise<boolean>,
) => {
	const removed: string[] = [];
	for (const sha256 of new Set(sha256s)) {
		if (await removePageObject(home, sha256, () => holdsSha(sha256))) removed.push(sha256);
	}
	return { removed };
};

export const storedPageHashes = async (home: string) => {
	await mkdir(pageObjectsDir(home), { recursive: true });
	const hashes: string[] = [];
	for await (const path of new Bun.Glob("[0-9a-f][0-9a-f]/*").scan(pageObjectsDir(home))) {
		const sha256 = path.slice(3);
		if (/^[0-9a-f]{64}$/.test(sha256) && path.slice(0, 2) === sha256.slice(0, 2)) hashes.push(sha256);
	}
	return hashes;
};

// A stream keeps its stage until it ends. Completed stages expire after 24 hours,
// so a request that stops before upload runs cannot retain its prepared file forever.
export const sweepPageTemp = async (home: string, now = Date.now()) => {
	await mkdir(pageTempDir(home), { recursive: true });
	let removed = 0;
	for (const name of await readdir(pageTempDir(home))) {
		const path = pageTempPath(home, name);
		if ((activeStages.get(path) ?? 0) > now) continue;
		await rm(path, { recursive: true, force: true });
		activeStages.delete(path);
		removed++;
	}
	return removed;
};
