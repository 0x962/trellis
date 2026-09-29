import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { Tx } from "../../../db/tx";
import { readLaunchSnapshot, readNativeSnapshotManifest } from "../../langflowNative";
import { syncDirectory } from "../syncDirectory";

const unavailableReasons = {
	snapshot_not_recorded: "The reservation has no recorded launch snapshot digest.",
	snapshot_missing: "The recorded launch snapshot file is missing.",
	snapshot_digest_conflict: "The launch snapshot bytes do not match the recorded digest.",
	snapshot_unsafe: "The launch snapshot file does not meet the private file requirements.",
};

export async function exportNativeSnapshots(ctx: { home: string }, tx: Tx, input: { directory: string }) {
	const source = await readNativeSnapshotManifest(ctx, tx);
	const root = join(input.directory, "workspaces", "native-launches");
	await mkdir(root, { mode: 0o700 });
	const files = [];
	for (const entry of source.files) {
		const bytes = await readLaunchSnapshot(ctx.home, entry.attemptId, entry.digest);
		const path = `workspaces/native-launches/${entry.attemptId}.json`;
		const file = await open(join(input.directory, path), "wx", 0o600);
		try {
			await file.writeFile(bytes);
			await file.sync();
		} finally {
			await file.close();
		}
		files.push({ ...entry, sourcePath: entry.path, path });
	}
	const unavailable = source.unavailable.map((entry) => ({
		reference: `native-launch:${entry.executionId}:${entry.stepId}:${entry.attemptId}`,
		reason: unavailableReasons[entry.reason],
	}));
	const manifest = { version: 1, ready: source.ready, files, unavailable: source.unavailable };
	const file = await open(join(root, "inventory.json"), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(manifest));
		await file.sync();
	} finally {
		await file.close();
	}
	await syncDirectory(root);
	await syncDirectory(join(input.directory, "workspaces"));
	return { manifest, unavailable };
}
