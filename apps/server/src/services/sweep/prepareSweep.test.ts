import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { workspaceOperation } from "../../agents/native/workspaceOperation";
import * as schema from "../../db/schema";
import type { Tx } from "../../db/tx";
import { ATTEMPT_MIN_AGE_MS } from "./prepareSweep";
import { sweepAttempts } from "./sweepAttempts";

const now = new Date("2026-10-01T00:00:00Z");
const retainedId = "00000000-0000-4000-8000-000000000001";
const withRetention = <T>(home: string, action: () => Promise<T>) =>
	workspaceOperation(join(home, "harness-attempts"), action);
const withAttempt = <T>(home: string, id: string, action: () => Promise<T>) =>
	workspaceOperation(join(home, "harness-attempts", id), action);

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
	const db = drizzle(new PGlite(), { schema });
	await db.$client.exec("CREATE TABLE langflow_native_handles(attempt_id text PRIMARY KEY)");
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
		await writeFile(join(directory, "launch.json"), bytes);
		const old = new Date(now.getTime() - ATTEMPT_MIN_AGE_MS - 1);
		await utimes(directory, old, old);
		return { id: attemptId, modifiedAt: old.getTime() };
	};
	return { db, home, ctx, addAttempt };
}

test("keeps attempt files until their reader releases retention", async () => {
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
	const reader = withRetention(f.home, async () => {
		expect(await readFile(join(f.home, "harness-attempts", attempt.id, "launch.json"), "utf8")).toBe(
			"private snapshot",
		);
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
	const currentWrite = withAttempt(f.home, attempt.id, async () => {
		locked();
		await lockRelease;
		await f.db.execute(sql`INSERT INTO agent_runs (id, terminal_id) VALUES (${"run"}, ${attempt.id})`);
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
	const laterRetention = withRetention(f.home, async () => {
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
	await f.db.execute(sql`INSERT INTO langflow_native_handles VALUES (${retainedId})`);
	const retained = await f.addAttempt(retainedId);
	const unreferenced = await f.addAttempt(crypto.randomUUID());
	expect(await sweepAttempts(f.ctx, [retained, unreferenced], ATTEMPT_MIN_AGE_MS)).toBe(1);
	expect((await stat(join(f.home, "harness-attempts", retained.id))).isDirectory()).toBe(true);
	await expect(stat(join(f.home, "harness-attempts", unreferenced.id))).rejects.toMatchObject({ code: "ENOENT" });
});

test("releases snapshot retention after the callback fails", async () => {
	const f = await fixture();
	const attempt = await f.addAttempt(crypto.randomUUID());
	await expect(
		withRetention(f.home, async () => {
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
	const attempt = await f.addAttempt(retainedId);
	let initialRead = true;
	const removed = await sweepAttempts(
		{
			...f.ctx,
			newTx: async <T>(action: (tx: Tx) => Promise<T>) => {
				const result = await f.ctx.newTx(action);
				if (initialRead) {
					initialRead = false;
					await f.ctx.newTx((tx) => tx.execute(sql`INSERT INTO langflow_native_handles VALUES (${retainedId})`));
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
