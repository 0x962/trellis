import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export const PAGES_DIR = "pages";
export const PAGE_OBJECTS_DIR = "objects";
export const PAGE_TEMP_DIR = "tmp";

export const pagesDir = (home: string) => join(home, PAGES_DIR);

export const pageObjectsDir = (home: string) => join(pagesDir(home), PAGE_OBJECTS_DIR);

export const pageTempDir = (home: string) => join(pagesDir(home), PAGE_TEMP_DIR);

export const pageTempPath = (home: string, uploadId: string) => join(pageTempDir(home), uploadId);

export const pageObjectPath = (home: string, sha256: string) => join(pageObjectsDir(home), sha256.slice(0, 2), sha256);

const HASH_CHUNK_BYTES = 1024 * 1024;

type Release = () => void;

const hashLocks = new Map<string, Promise<void>>();
const uploadLocks = new Map<string, Promise<void>>();
const liveHashes = new Map<string, number>();
const holderObservations = new Map<string, Set<{ invalidated: boolean }>>();

const invalidateHolderObservations = (sha256: string) => {
	for (const observation of holderObservations.get(sha256) ?? []) observation.invalidated = true;
};

const acquire = async (locks: Map<string, Promise<void>>, key: string): Promise<Release> => {
	const running = locks.get(key);
	let done: Release = () => {};
	const held = new Promise<void>((resolve) => {
		done = resolve;
	});
	locks.set(key, held);
	if (running !== undefined) await running;
	return () => {
		done();
		if (locks.get(key) === held) locks.delete(key);
	};
};

const retainHash = (sha256: string): Release => {
	invalidateHolderObservations(sha256);
	liveHashes.set(sha256, (liveHashes.get(sha256) ?? 0) + 1);
	return () => {
		const remaining = liveHashes.get(sha256)! - 1;
		if (remaining === 0) liveHashes.delete(sha256);
		else liveHashes.set(sha256, remaining);
	};
};

const observeHolder = (sha256: string) => {
	const observation = { invalidated: false };
	const observations = holderObservations.get(sha256) ?? new Set();
	observations.add(observation);
	holderObservations.set(sha256, observations);
	return {
		observation,
		release: () => {
			observations.delete(observation);
			if (observations.size === 0) holderObservations.delete(sha256);
		},
	};
};

export type StagedPageObject = {
	uploadId: string;
	sha256: string;
	size: number;
	releaseUpload: Release;
};

export type FinalizedPageObject = {
	path: string;
	release: Release;
};

// `stagePageObject` keeps two requests with one upload id from writing the same
// temporary file. `finalizePageObject` and `discardPageObject` release that lock.
export const stagePageObject = async (home: string, uploadId: string, file: File): Promise<StagedPageObject> => {
	const releaseUpload = await acquire(uploadLocks, uploadId);
	let staged = false;
	try {
		await mkdir(pageTempDir(home), { recursive: true });
		const hasher = new Bun.CryptoHasher("sha256");
		const sink = Bun.file(pageTempPath(home, uploadId)).writer();
		const reader = file.stream().getReader();
		let size = 0;
		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_BYTES) {
				const part = chunk.subarray(offset, offset + HASH_CHUNK_BYTES);
				hasher.update(part);
				sink.write(part);
				size += part.byteLength;
			}
		}
		await sink.end();
		staged = true;
		return { uploadId, sha256: hasher.digest("hex"), size, releaseUpload };
	} finally {
		if (!staged) releaseUpload();
	}
};

export const discardPageObject = async (home: string, staged: StagedPageObject) => {
	try {
		await unlink(pageTempPath(home, staged.uploadId));
	} finally {
		staged.releaseUpload();
	}
};

// `finalizePageObject` marks its hash as live before it renames the file.
// `gcPageObjects` keeps that object until the caller records its database row.
export const finalizePageObject = async (home: string, staged: StagedPageObject): Promise<FinalizedPageObject> => {
	const releaseHash = retainHash(staged.sha256);
	let finalized = false;
	try {
		const releaseLock = await acquire(hashLocks, staged.sha256);
		let path: string;
		try {
			path = pageObjectPath(home, staged.sha256);
			const source = pageTempPath(home, staged.uploadId);
			if (existsSync(path)) await unlink(source);
			else {
				await mkdir(dirname(path), { recursive: true });
				await rename(source, path);
			}
		} finally {
			releaseLock();
		}
		finalized = true;
		return { path, release: releaseHash };
	} finally {
		staged.releaseUpload();
		if (!finalized) releaseHash();
	}
};

// `removePageObject` reads the database holder before it waits for the hash lock.
// `retainHash` invalidates that observation before each finalize, so an older
// result cannot remove the new object.
const removePageObject = async (home: string, sha256: string, holdsSha: () => Promise<boolean>) => {
	const holder = observeHolder(sha256);
	try {
		if (await holdsSha()) return false;
		const releaseLock = await acquire(hashLocks, sha256);
		try {
			if (liveHashes.has(sha256) || holder.observation.invalidated) return false;
			await unlink(pageObjectPath(home, sha256));
			invalidateHolderObservations(sha256);
			return true;
		} finally {
			releaseLock();
		}
	} finally {
		holder.release();
	}
};

// `holdsSha` must run a current database query. A cached holder set can miss a
// row committed while garbage collection waits for a hash lock.
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
