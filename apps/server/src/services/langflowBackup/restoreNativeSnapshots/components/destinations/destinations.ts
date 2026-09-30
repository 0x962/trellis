import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { protocolDigest } from "../../../../../langflowContracts";
import { readLaunchSnapshot, writeLaunchSnapshot } from "../../../../langflowNative/launchSnapshot";
import { syncDirectory } from "../../../syncDirectory";
import { privateDirectory, privateFile } from "../privateFile";
import type { readRestoreSource } from "../readRestoreSource";
import { LaunchBindingSchema } from "../schema";

type Source = Awaited<ReturnType<typeof readRestoreSource>>;

export async function destinations(source: Source, install: boolean, signal: AbortSignal) {
	const home = source.intent.identity.home;
	const root = join(home, "harness-attempts");
	if (install) {
		await mkdir(root, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "EEXIST") throw error;
		});
		await syncDirectory(home);
	}
	if (source.inventory.files.length > 0 || install) await privateDirectory(root);
	const files = [];
	for (const entry of source.inventory.files) {
		signal.throwIfAborted();
		const captured = await privateFile(join(source.seal.directory, entry.path));
		const expected = source.seal.manifest.files.find((file) => file.path === entry.path)!;
		if (captured.size !== expected.size || protocolDigest(captured.text) !== entry.digest)
			throw new Error("native_restore_source_changed");
		const saved = LaunchBindingSchema.parse(JSON.parse(captured.text));
		if (saved.executionId !== entry.executionId || saved.stepId !== entry.stepId ||
			saved.requestDigest !== entry.requestDigest || saved.launch.run.id !== entry.agentRunId ||
			saved.launch.attempt.id !== entry.attemptId)
			throw new Error("native_restore_launch_conflict");
		const directory = join(root, entry.attemptId);
		const path = join(directory, "langflow-launch.json");
		const existingDirectory = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (existingDirectory !== null) await privateDirectory(directory);
		const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (existing === null && install) await writeLaunchSnapshot(home, entry.attemptId, captured.text);
		await privateDirectory(directory);
		const actual = await privateFile(path);
		const verified = await readLaunchSnapshot(home, entry.attemptId, entry.digest);
		if (actual.text !== captured.text || verified !== captured.text || actual.size !== captured.size)
			throw new Error("native_restore_destination_conflict");
		const stat = await lstat(path);
		files.push({
			executionId: entry.executionId,
			stepId: entry.stepId,
			agentRunId: entry.agentRunId,
			attemptId: entry.attemptId,
			requestDigest: entry.requestDigest,
			sourcePath: entry.path,
			sourceDigest: entry.digest,
			destination: { path, digest: protocolDigest(verified), size: actual.size, mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid },
		});
	}
	signal.throwIfAborted();
	return files;
}
