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
		log: () => {},
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
	let referencesRead!: () => void;
	const initialRead = new Promise<void>((resolve) => {
		referencesRead = resolve;
	});
	const sweep = sweepAttempts(
		{
			...f.ctx,
			newTx: async <T>(action: (tx: Tx) => Promise<T>) => {
				const result = await f.ctx.newTx(action);
				referencesRead();
				return result;
			},
		},
		[attempt],
		ATTEMPT_MIN_AGE_MS,
	);
	let laterRetentionRan = false;
	const laterRetention = withNativeSnapshotRetention(f.home, async () => {
		laterRetentionRan = true;
	});
	await Promise.resolve();
	expect(laterRetentionRan).toBe(false);
	await initialRead;
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

test("keeps a native reservation created after the initial reference read", async () => {
	const f = await fixture();
	const attempt = await f.addAttempt(handle.attemptId);
	let initialRead = true;
	const removed = await sweepAttempts(
		{
			...f.ctx,
			newTx: async <T>(action: (tx: Tx) => Promise<T>) => {
				const result = await f.ctx.newTx(action);
				if (initialRead) {
					initialRead = false;
					await f.ctx.newTx((tx) =>
						reserveNative(tx, {
							requestBytes: JSON.stringify(nativeRequest),
							taskKey: "late-reservation",
							handle,
							authority: f.authority,
							now,
						}),
					);
				}
				return result;
			},
		},
		[attempt],
		ATTEMPT_MIN_AGE_MS,
	);
	expect(removed).toBe(0);
	expect((await stat(join(f.home, "harness-attempts", attempt.id))).isDirectory()).toBe(true);
});

const retainedAttempts = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
		modifiedAt: 0,
	}));

const insertReferences = (tx: Tx, count: number) =>
	tx.execute(sql`
	INSERT INTO agent_runs SELECT i::text, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0')
	FROM generate_series(1, ${count}::int) AS n(i)
`);

test("reads references once for a large retained attempt inventory", async () => {
	const f = await fixture();
	const count = 1_000;
	await f.ctx.newTx((tx) => insertReferences(tx, count));
	let transactions = 0;
	const logs: { message: string; fields: Record<string, unknown> | undefined }[] = [];
	const removed = await sweepAttempts(
		{
			...f.ctx,
			log: (message, fields) => logs.push({ message, fields }),
			newTx: <T>(action: (tx: Tx) => Promise<T>) => {
				transactions += 1;
				return f.ctx.newTx(action);
			},
		},
		retainedAttempts(count),
		ATTEMPT_MIN_AGE_MS,
	);
	expect(removed).toBe(0);
	expect(transactions).toBe(1);
	expect(logs).toMatchObject([
		{ message: "sweep attempt candidates", fields: { directories: count, candidates: 0 } },
		{ message: "sweep attempts completed", fields: { checked: 0, retained: 0, removed: 0 } },
	]);
});

test("serves a timer query while attempts gain references after the initial read", async () => {
	const f = await fixture();
	const count = 1_000;
	let transactions = 0;
	let sweepCompleted = false;
	let readDuringSweep = false;
	let timerQuery: Promise<void> | undefined;
	const removed = await sweepAttempts(
		{
			...f.ctx,
			newTx: async <T>(action: (tx: Tx) => Promise<T>) => {
				const result = await f.ctx.newTx(action);
				transactions += 1;
				if (transactions === 1) {
					await f.ctx.newTx((tx) => insertReferences(tx, count));
					timerQuery = new Promise<void>((resolve) =>
						setTimeout(async () => {
							await f.db.execute(sql`SELECT 1`);
							readDuringSweep = !sweepCompleted;
							resolve();
						}, 0),
					);
				}
				return result;
			},
		},
		retainedAttempts(count),
		ATTEMPT_MIN_AGE_MS,
	);
	sweepCompleted = true;
	await timerQuery;
	expect(removed).toBe(0);
	expect(transactions).toBe(count + 1);
	expect(readDuringSweep).toBe(true);
});
