import { join } from "node:path";

const HASH_CHUNK_BYTES = 1024 * 1024;

type HashedFile = { sha256: string; size: number };
type WriteChunk = (chunk: Uint8Array) => void;

export async function hashFile(file: Blob, write: WriteChunk): Promise<HashedFile> {
	const hasher = new Bun.CryptoHasher("sha256");
	const reader = file.stream().getReader();
	let size = 0;
	while (true) {
		const { done, value: chunk } = await reader.read();
		if (done) break;
		for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_BYTES) {
			const part = chunk.subarray(offset, offset + HASH_CHUNK_BYTES);
			hasher.update(part);
			write(part);
			size += part.byteLength;
		}
	}
	return { sha256: hasher.digest("hex"), size };
}

export const shardedHashPath = (root: string, sha256: string) => join(root, sha256.slice(0, 2), sha256);

const hashLocks = new Map<string, Promise<void>>();

// `withHashLock` runs tasks for one object path in call order. It removes
// the map entry after the last task for that path finishes.
export const withHashLock = async <T>(path: string, task: () => Promise<T>): Promise<T> => {
	const running = hashLocks.get(path);
	let done = () => {};
	const held = new Promise<void>((resolve) => {
		done = resolve;
	});
	hashLocks.set(path, held);
	if (running !== undefined) await running;
	try {
		return await task();
	} finally {
		done();
		if (hashLocks.get(path) === held) hashLocks.delete(path);
	}
};
