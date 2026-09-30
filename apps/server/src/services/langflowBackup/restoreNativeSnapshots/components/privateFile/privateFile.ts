import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname } from "node:path";

export async function privateFile(path: string) {
	if (await realpath(dirname(path)) !== dirname(path)) throw new Error("native_restore_path_unsafe");
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
			throw new Error("native_restore_file_unsafe");
		const bytes = await file.readFile();
		const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
		if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("native_restore_utf8_conflict");
		return { text, size: bytes.length };
	} finally {
		await file.close();
	}
}

export async function privateDirectory(path: string) {
	const stat = await lstat(path);
	if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() ||
		(stat.mode & 0o777) !== 0o700 || await realpath(path) !== path)
		throw new Error("native_restore_directory_unsafe");
}
