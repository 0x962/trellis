import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../agents/harnessHost/harnessHost";
import { createCache } from "../../db/cache";
import { openTestDb } from "../../db/testDb";
import type { startNative } from "../agentRuns/nativeStart";
import { pauseRestartFixture } from "../agentRuns/pauseRestartFixture";
import { getRun } from "../agentRuns/queries";
import { prepareResume } from "../agentRuns/resume";
import { resumeIdleSession } from "../agentRuns/resumeIdleSession/resumeIdleSession";
import { prepareStart } from "../sessions/start";
import type { IoCtx } from "../support";
import { ATTEMPT_MIN_AGE_MS } from "../sweep/prepareSweep";
import { sweepAttempts } from "../sweep/sweepAttempts";
import { attemptRetention } from "./attemptRetention";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
let ctx: IoCtx;
let pending: Promise<unknown>[] = [];
const now = new Date("2026-09-30T12:00:00Z");
const recover = spyOn(HarnessHost.prototype, "recover");
const waitFor = spyOn(HarnessHost.prototype, "waitFor");

beforeAll(async () => {
	db = await openTestDb();
	home = await mkdtemp(join(tmpdir(), "trellis-resume-retention-"));
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const actor = { kind: "human" as const, name: "qa" };
	ctx = {
		home,
		actor,
		session: null,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: (action) => {
			pending.push(action(ctx));
		},
		now: () => now,
		newTx: (action) => db.transaction(action),
		emit: () => {},
		core: {
			actor,
			now,
			cache,
			actorCache: new Map(),
			session: null,
			reqId: ulid(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost",
		},
	};
}, 60_000);

afterEach(async () => {
	await Promise.allSettled(pending);
	pending = [];
});

afterAll(async () => {
	recover.mockRestore();
	waitFor.mockRestore();
	await db.$client.close();
	await rm(home, { recursive: true, force: true });
});

async function fixture() {
	const runId = ulid(),
		sessionRowId = ulid(),
		attemptId = crypto.randomUUID(),
		sessionId = crypto.randomUUID();
	const workspace = join(home, runId);
	const directory = join(home, "harness-attempts", attemptId);
	const path = join(directory, "launch.json");
	const bytes = JSON.stringify({ harness: "claude", sessionId, spec: { cwd: workspace, env: {} } });
	await mkdir(directory, { recursive: true });
	await writeFile(path, bytes);
	const old = new Date(now.getTime() - ATTEMPT_MIN_AGE_MS - 1);
	await utimes(directory, old, old);
	const inventory = [{ id: attemptId, modifiedAt: (await stat(directory)).mtimeMs }];
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_key,harness,terminal_id,session_id,workspace_id,created_at,updated_at)
		VALUES (${runId},'retention','session','Work','', '{"preset":"claude"}'::jsonb,
		${attemptId},${sessionId},${workspace},${now},${now})`);
	await db.execute(sql`INSERT INTO sessions (id,name,directory,harness,run_id,created_at,updated_at)
		VALUES (${sessionRowId},'retention',${workspace},'{"preset":"claude"}'::jsonb,${runId},${now},${now})`);
	const previous = { ...pauseRestartFixture(attemptId, now), launch: { command: "claude", args: [], cwd: workspace } };
	recover.mockImplementation(async () => previous);
	waitFor.mockImplementation(async () => previous);
	return { runId, sessionRowId, attemptId, sessionId, workspace, path, bytes, inventory, previous };
}

for (const path of ["manual", "idle", "session"] as const) {
	for (const fails of [false, true]) {
		test(`${path} resume retains the inventoried descriptor until ${fails ? "failure" : "success"}`, async () => {
			const f = await fixture();
			let reads = 0;
			const start: typeof startNative = async (_ctx, input) => {
				const stored = await ctx.newTx((tx) => getRun(tx, f.runId));
				expect(stored.terminalId).toBe(input.attempt.id);
				expect(stored.terminalId).not.toBe(f.attemptId);
				expect(stored.sessionId).toBe(f.sessionId);
				expect(stored.workspaceId).toBe(f.workspace);
				expect(stored.closedAt).toBeNull();
				expect(await sweepAttempts(ctx, f.inventory, ATTEMPT_MIN_AGE_MS)).toBe(0);
				expect(await readFile(f.path, "utf8")).toBe(f.bytes);
				reads++;
				if (fails) throw new Error("resume_failed");
				return { id: f.runId };
			};
			const resume =
				path === "manual"
					? prepareResume(
							ctx,
							{ id: f.runId, expectedTerminalId: f.attemptId, requestId: crypto.randomUUID() },
							start,
							false,
							async () => f.previous,
						)
					: path === "idle"
						? resumeIdleSession(
								ctx,
								{ id: f.runId, terminalId: f.attemptId, text: "Continue", messageId: crypto.randomUUID() },
								start,
							)
						: prepareStart(
								ctx,
								{ id: f.sessionRowId },
								{ start, process: async () => f.previous, preset: async () => "claude" },
							);
			if (fails && path !== "session") await expect(resume).rejects.toThrow("resume_failed");
			else await resume;
			await Promise.allSettled(pending);
			expect(reads).toBe(1);
			expect(await sweepAttempts(ctx, f.inventory, ATTEMPT_MIN_AGE_MS)).toBe(1);
			await expect(readFile(f.path)).rejects.toMatchObject({ code: "ENOENT" });
		});
	}
}

test("releases retention when resume fails before reservation", async () => {
	const f = await fixture();
	await expect(
		prepareResume(
			ctx,
			{
				id: f.runId,
				expectedTerminalId: f.attemptId,
				requestId: crypto.randomUUID(),
			},
			undefined,
			false,
			async () => {
				throw new Error("recover_failed");
			},
		),
	).rejects.toThrow("recover_failed");
	await db.execute(sql`UPDATE agent_runs SET terminal_id=NULL WHERE id=${f.runId}`);
	expect(await sweepAttempts(ctx, f.inventory, ATTEMPT_MIN_AGE_MS)).toBe(1);
});

test("retains an attempt until every reader releases it", async () => {
	const f = await fixture();
	const first = await attemptRetention.retain(home, f.attemptId);
	const second = await attemptRetention.retain(home, f.attemptId);
	try {
		await db.execute(sql`UPDATE agent_runs SET terminal_id=NULL WHERE id=${f.runId}`);
		first();
		expect(await sweepAttempts(ctx, f.inventory, ATTEMPT_MIN_AGE_MS)).toBe(0);
		expect(await readFile(f.path, "utf8")).toBe(f.bytes);
	} finally {
		second();
	}
	expect(await sweepAttempts(ctx, f.inventory, ATTEMPT_MIN_AGE_MS)).toBe(1);
});
