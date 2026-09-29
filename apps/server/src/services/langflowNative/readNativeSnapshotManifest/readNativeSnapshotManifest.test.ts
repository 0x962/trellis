import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindLaunchSnapshot, reserveNative } from "../../../db/queries/langflowExecution";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import { writeLaunchSnapshot } from "../launchSnapshot";
import { readNativeSnapshotManifest } from "./readNativeSnapshotManifest";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

test("lists each unavailable snapshot and preserves exact archive bindings", async () => {
	const { db, authority } = await receiptFixture();
	const home = await mkdtemp(join(tmpdir(), "trellis-native-manifest-"));
	cleanups.push(
		() => db.$client.close(),
		() => rm(home, { recursive: true, force: true }),
	);
	await db.transaction((tx) =>
		reserveNative(tx, { requestBytes: JSON.stringify(nativeRequest), taskKey: "exact/task", handle, authority, now }),
	);
	const read = () => db.transaction((tx) => readNativeSnapshotManifest({ home }, tx));
	expect((await read()).unavailable[0]!.reason).toBe("snapshot_not_recorded");
	const digest = await writeLaunchSnapshot(home, handle.attemptId, "private fixture bytes");
	await db.transaction((tx) =>
		bindLaunchSnapshot(tx, { executionId: ids.execution, stepId: handle.stepId, attemptId: handle.attemptId, digest }),
	);
	const manifest = await read();
	expect(manifest.ready).toBe(true);
	expect(manifest.files[0]).toMatchObject({
		executionId: ids.execution,
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		digest,
	});
	expect(JSON.stringify(manifest)).not.toContain("private fixture bytes");
	const path = join(home, manifest.files[0]!.path);
	await writeFile(path, "changed");
	expect((await read()).unavailable[0]!.reason).toBe("snapshot_digest_conflict");
	await rm(path);
	expect((await read()).unavailable[0]!.reason).toBe("snapshot_missing");
});
