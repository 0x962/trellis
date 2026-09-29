import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { protocolDigest } from "../../../langflowContracts";

async function directoryFor(home: string, attemptId: string, create: boolean) {
	const directory = join(home, "harness-attempts", attemptId);
	if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
	const stat = await lstat(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid!())
		throw new Error("native_snapshot_directory_unsafe");
	return directory;
}

export async function writeLaunchSnapshot(home: string, attemptId: string, bytes: string) {
	const directory = await directoryFor(home, attemptId, true);
	const temporary = join(directory, `langflow-launch-${crypto.randomUUID()}.tmp`);
	const file = await open(
		temporary,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
		0o600,
	);
	try {
		await file.writeFile(bytes);
		await file.sync();
	} finally {
		await file.close();
	}
	try {
		await link(temporary, join(directory, "langflow-launch.json"));
	} finally {
		await unlink(temporary);
	}
	const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
	try {
		await parent.sync();
	} finally {
		await parent.close();
	}
	const attempts = await open(
		join(home, "harness-attempts"),
		constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
	);
	try {
		await attempts.sync();
	} finally {
		await attempts.close();
	}
	return protocolDigest(bytes);
}

export async function readLaunchSnapshot(home: string, attemptId: string, digest: string) {
	const directory = await directoryFor(home, attemptId, false);
	const file = await open(join(directory, "langflow-launch.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid!())
			throw new Error("native_snapshot_file_unsafe");
		const bytes = await file.readFile("utf8");
		if (protocolDigest(bytes) !== digest) throw new Error("native_snapshot_digest_conflict");
		return bytes;
	} finally {
		await file.close();
	}
}
