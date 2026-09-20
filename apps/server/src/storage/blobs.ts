import { existsSync, readdirSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

// An attachment or evidence file is stored once per sha256 and is named by that hash.
// The first two characters of the hash are a directory, so one directory
// never holds every file of the machine. No database row keeps a path, so a
// data home that moves to another directory still resolves every file.
//
// Three operations share one lock per sha256:
//   finalize  moves an upload out of `attachments/tmp` to its hash path.
//   gc        removes the file of one hash when no database row holds it.
//   sweep     removes every file no row holds, at boot.
// The lock keeps the row check of a delete from running while an upload of
// the same hash sits between its rename and its database row.

export const ATTACHMENTS_DIR = "attachments";
export const TEMP_DIR = "tmp";

export const attachmentsDir = (home: string) => join(home, ATTACHMENTS_DIR);

export const tempDir = (home: string) => join(attachmentsDir(home), TEMP_DIR);

export const tempPath = (home: string, name: string) => join(tempDir(home), name);

export const blobPath = (home: string, sha: string) => join(attachmentsDir(home), sha.slice(0, 2), sha);

const HASH_CHUNK_BYTES = 1024 * 1024;

// The task of each hash waits for the task before it. `locks` holds the
// promise of the running task; a task that finds none runs at once. The
// entry is dropped when the last task of that hash finishes, so the map
// holds one entry per upload or delete in flight.
const locks = new Map<string, Promise<void>>();

const withBlobLock = async <T>(sha: string, task: () => Promise<T>): Promise<T> => {
	const running = locks.get(sha);
	let done: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		done = resolve;
	});
	locks.set(sha, held);
	if (running !== undefined) await running;
	try {
		return await task();
	} finally {
		done();
		if (locks.get(sha) === held) locks.delete(sha);
	}
};

// The temp file names of the uploads in flight. sweep leaves those files and
// removes every other file under `attachments/tmp`.
const liveTempFiles = new Set<string>();

export const markLiveTempFile = (name: string) => {
	liveTempFiles.add(name);
	return () => {
		liveTempFiles.delete(name);
	};
};

// Moves the upload at `attachments/tmp/<name>` to the path of its hash and
// returns that path. A file with the same hash is already the same bytes, so
// the stored file stays as it is and the upload is dropped.
export const finalize = (home: string, name: string, sha: string): Promise<string> =>
	withBlobLock(sha, async () => {
		const path = blobPath(home, sha);
		const source = tempPath(home, name);
		if (existsSync(path)) {
			await unlink(source);
			return path;
		}
		await mkdir(dirname(path), { recursive: true });
		await rename(source, path);
		return path;
	});

// Writes a file to its hash path without holding the full file in memory.
export const storeFile = async (home: string, file: File) => {
	const name = ulid();
	const release = markLiveTempFile(name);
	const hasher = new Bun.CryptoHasher("sha256");
	const sink = Bun.file(tempPath(home, name)).writer();
	let size = 0;
	for await (const chunk of file.stream()) {
		for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_BYTES) {
			const part = chunk.subarray(offset, offset + HASH_CHUNK_BYTES);
			hasher.update(part);
			sink.write(part);
			size += part.byteLength;
		}
	}
	await sink.end();
	const sha256 = hasher.digest("hex");
	await finalize(home, name, sha256);
	release();
	return { sha256, size };
};

export const sha256OfFile = async (file: File) => {
	const hasher = new Bun.CryptoHasher("sha256");
	for await (const chunk of file.stream()) {
		for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_BYTES)
			hasher.update(chunk.subarray(offset, offset + HASH_CHUNK_BYTES));
	}
	return hasher.digest("hex");
};

// The database stores a MIME type without parameters. An empty or malformed
// type becomes a download instead of content that the app origin can run.
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

export const storedMime = (type: string) => {
	const essence = type.split(";")[0]!.trim().toLowerCase();
	return MIME_PATTERN.test(essence) ? essence : "application/octet-stream";
};

// Removes the file of one hash when `hasRows` reports that no database row
// holds it. Returns whether the file was removed. `hasRows` runs under the
// lock, so a finalize of the same hash finishes first and its row is counted.
const gc = (home: string, sha: string, hasRows: () => Promise<boolean>): Promise<boolean> =>
	withBlobLock(sha, async () => {
		if (await hasRows()) return false;
		await unlink(blobPath(home, sha));
		return true;
	});

export const gcBlobs = async (home: string, shas: string[], holdsSha: (sha256: string) => Promise<boolean>) => {
	const removed: string[] = [];
	for (const sha256 of new Set(shas)) {
		if (await gc(home, sha256, () => holdsSha(sha256))) removed.push(sha256);
	}
	return { removed };
};

export type SweepResult = { removedBlobs: string[]; removedTemp: string[] };

const shardDirs = (home: string) =>
	readdirSync(attachmentsDir(home), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== TEMP_DIR)
		.map((entry) => entry.name);

// Runs at boot, before the server answers a request. `liveShas` is every
// sha256 that an attachment or evidence row holds. A process can stop between
// a committed delete and the file removal. This sweep removes that unowned file.
// Every file under `attachments/tmp` belongs to an upload that stopped, unless
// an upload in flight marked it.
export const sweep = async (home: string, liveShas: string[]): Promise<SweepResult> => {
	await mkdir(tempDir(home), { recursive: true });
	const live = new Set(liveShas);
	const removedBlobs: string[] = [];
	for (const shard of shardDirs(home)) {
		for (const sha of readdirSync(join(attachmentsDir(home), shard))) {
			if (live.has(sha)) continue;
			await unlink(blobPath(home, sha));
			removedBlobs.push(sha);
		}
	}
	const removedTemp: string[] = [];
	for (const name of readdirSync(tempDir(home))) {
		if (liveTempFiles.has(name)) continue;
		await unlink(tempPath(home, name));
		removedTemp.push(name);
	}
	return { removedBlobs: removedBlobs.sort(), removedTemp: removedTemp.sort() };
};
