import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { workspaceOperation } from "../../agents/native/workspaceOperation";
import { reserveNative } from "../../db/queries/langflowExecution";
import { ids, now, receiptFixture } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../db/queries/langflowExecution/fixtures/native";
import type { Tx } from "../../db/tx";
import { readLaunchSnapshot, withNativeSnapshotRetention } from "../langflowNative";
import { writeLaunchSnapshot } from "../langflowNative/launchSnapshot";
import { withAttemptOperation } from "../langflowStops/withAttemptOperation";
import { ATTEMPT_MIN_AGE_MS } from "./prepareSweep";
import { sweepAttempts } from "./sweepAttempts";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
	const { db, authority } = await receiptFixture();
	await db.$client.exec("CREATE TABLE agent_runs(id text PRIMARY KEY, terminal_id text)");
	const home = await mkdtemp(join(tmpdir(), "trellis-sweep-retention-"));
	cleanups.push(
		() => db.$client.close(),
		() => rm(home, { recursive: true, force: true }),
	);
	const ctx = {
		home,
		now: () => now,
		newTx: <T>(action: (tx: Tx) => Promise<T>) => db.transaction(action),
	};
	const addAttempt = async (attemptId: string, bytes = "snapshot") => {
		const directory = join(home, "harness-attempts", attemptId);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const digest = await writeLaunchSnapshot(home, attemptId, bytes);
		const old = new Date(now.getTime() - ATTEMPT_MIN_AGE_MS - 1);
		await utimes(directory, old, old);
		return { id: attemptId, modifiedAt: old.getTime(), digest };
	};
	return { db, authority, home, ctx, addAttempt };
}

test("keeps a validated snapshot until its reader releases retention", async () => {
	const f = await fixture();
	const attempt = await f.addAttempt(crypto.randomUUID(), "private snapshot");
	let release!: () => void;
	let read!: () => void;
	const reading = new Promise<void>((resolve) => {
		read = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	const reader = withNativeSnapshotRetention(f.home, async () => {
		expect(await readLaunchSnapshot(f.home, attempt.id, attempt.digest)).toBe("private snapshot");
		read();
		await released;
	});
	await reading;
	const sweep = sweepAttempts(f.ctx, [attempt], ATTEMPT_MIN_AGE_MS);
	await Promise.resolve();
	expect((await stat(join(f.home, "harness-attempts", attempt.id))).isDirectory()).toBe(true);
	release();
	await reader;
	expect(await sweep).toBe(1);
	await expect(stat(join(f.home, "harness-attempts", attempt.id))).rejects.toMatchObject({ code: "ENOENT" });
});

test("takes retention before the attempt lock and rechecks the current terminal", async () => {
	const f = await fixture();
	const attempt = await f.addAttempt(crypto.randomUUID());
	let release!: () => void;
	let locked!: () => void;
	const lockHeld = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const lockRelease = new Promise<void>((resolve) => {
		release = resolve;
	});
	const currentWrite = withAttemptOperation(f.home, attempt.id, async () => {
		locked();
		await lockRelease;
		await f.db.execute(sql`INSERT INTO agent_runs (id, terminal_id) VALUES (${ids.execution}, ${attempt.id})`);
	});
	await lockHeld;
	const sweep = sweepAttempts(f.ctx, [attempt], ATTEMPT_MIN_AGE_MS);
	let laterRetentionRan = false;
	const laterRetention = withNativeSnapshotRetention(f.home, async () => {
		laterRetentionRan = true;
	});
	await Promise.resolve();
	expect(laterRetentionRan).toBe(false);
	release();
	await currentWrite;
	expect(await sweep).toBe(0);
	await laterRetention;
	expect(laterRetentionRan).toBe(true);
	expect((await stat(join(f.home, "harness-attempts", attempt.id))).isDirectory()).toBe(true);
});

test("keeps each retained reservation and removes an unreferenced attempt", async () => {
	const f = await fixture();
	await f.db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "retained-task",
			handle,
			authority: f.authority,
			now,
		}),
	);
	const retained = await f.addAttempt(handle.attemptId);
	const unreferenced = await f.addAttempt(crypto.randomUUID());
	expect(await sweepAttempts(f.ctx, [retained, unreferenced], ATTEMPT_MIN_AGE_MS)).toBe(1);
	expect((await stat(join(f.home, "harness-attempts", retained.id))).isDirectory()).toBe(true);
	await expect(stat(join(f.home, "harness-attempts", unreferenced.id))).rejects.toMatchObject({ code: "ENOENT" });
});

test("releases snapshot retention after the callback fails", async () => {
	const f = await fixture();
	const attempt = await f.addAttempt(crypto.randomUUID());
	await expect(
		withNativeSnapshotRetention(f.home, async () => {
			throw new Error("snapshot_failed");
		}),
	).rejects.toThrow("snapshot_failed");
	expect(await sweepAttempts(f.ctx, [attempt], ATTEMPT_MIN_AGE_MS)).toBe(1);
	let acquired = false;
	await workspaceOperation(join(f.home, "harness-attempts"), async () => {
		acquired = true;
	});
	expect(acquired).toBe(true);
});
