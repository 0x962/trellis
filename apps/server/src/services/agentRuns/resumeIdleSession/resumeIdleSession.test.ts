import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { IoCtx } from "../../support.ts";
import { closeExitedAssignments } from "../closeExitedAssignments.ts";
import { prepareSend } from "../communication.ts";
import { refreshNative } from "../nativeLifecycle.ts";
import type { startNative } from "../nativeStart.ts";
import { getRun } from "../queries.ts";
import { resumeIdleSession } from "./resumeIdleSession.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
let home: string;
const status = spyOn(HarnessHost.prototype, "status");
const waitFor = spyOn(HarnessHost.prototype, "waitFor");
const at = new Date("2026-09-23T12:00:00Z");

beforeAll(async () => {
	db = await openTestDb();
	home = await mkdtemp(join(tmpdir(), "trellis-idle-resume-test-"));
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	ctx = {
		home,
		actor: { kind: "human", name: "qa" },
		session: null,
		maxUploadBytes: 1024,
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
		background: () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
		core: {
			actor: { kind: "human", name: "qa" },
			now: at,
			cache,
			actorCache: new Map(),
			session: null,
			reqId: ulid(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost",
		},
	};
}, 30_000);

// Remove the temporary directory before the call to db.$client.close().
// A close that throws would otherwise leave the directory on disk.
afterAll(async () => {
	status.mockRestore();
	waitFor.mockRestore();
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

async function fixture() {
	const id = ulid(),
		terminalId = crypto.randomUUID(),
		sessionId = crypto.randomUUID();
	const workspace = join(home, id);
	await mkdir(join(home, "harness-attempts", terminalId), { recursive: true });
	await writeFile(join(home, "harness-attempts", terminalId, "launch.json"), JSON.stringify({ harness: "claude" }));
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_key,harness,terminal_id,session_id,workspace_id,created_at,updated_at)
		VALUES (${id},'idle-test','session','Original task','',${JSON.stringify({ preset: "claude" })}::jsonb,
		${terminalId},${sessionId},${workspace},${at},${at})`);
	const saved: RuntimeProcessStatus = {
		id: terminalId,
		daemonId: "test",
		pid: null,
		mode: "pty",
		status: "exited",
		stopReason: "idle",
		startedAt: at.toISOString(),
		endedAt: at.toISOString(),
		exitCode: 0,
		error: null,
		checkedAt: at.toISOString(),
		elapsedMs: 0,
		controllable: false,
		process: null,
		launch: { command: "claude", args: [], cwd: workspace },
		agent: {
			sessionId,
			model: null,
			turnId: null,
			tool: null,
			lastTool: null,
			lastMessage: null,
			error: null,
			outcome: "completed",
		},
		activity: { state: "idle", updatedAt: at.toISOString() },
		acknowledgedMessageIds: [terminalId],
		result: null,
	};
	let current = saved;
	let launches = 0,
		sends = 0,
		waits = 0;
	let prompt: string | undefined;
	status.mockImplementation(async () => saved);
	waitFor.mockImplementation(async (_id, matches) => {
		waits++;
		expect(matches(saved)).toBe(true);
		return saved;
	});
	const start: typeof startNative = async (_ctx, input) => {
		launches++;
		prompt = input.resumePrompt;
		expect(input.resume).toBe(true);
		expect(input.previousAttemptId).toBe(terminalId);
		expect(input.run.sessionId).toBe(sessionId);
		expect(input.config.directory).toBe(workspace);
		current = {
			...saved,
			id: input.attempt.id,
			stopReason: undefined,
			status: "running",
			endedAt: null,
			controllable: true,
			acknowledgedMessageIds: [input.attempt.id],
		};
		return { id, launchedAt: at.toISOString() };
	};
	const deps = {
		client: {
			inspect: async () => current,
			deliver: async () => {
				throw new Error("Unexpected terminal delivery");
			},
			subscribeSession: async function* () {},
		},
		host: {
			send: async () => {
				sends++;
				return current;
			},
			interrupt: async () => current,
		},
		preset: async () => "claude" as const,
		resume: (context: Parameters<typeof resumeIdleSession>[0], input: Parameters<typeof resumeIdleSession>[1]) =>
			resumeIdleSession(context, input, start),
	};
	return {
		id,
		terminalId,
		saved,
		deps,
		stats: () => ({ launches, sends, waits, prompt }),
		setCurrent: (value: RuntimeProcessStatus) => {
			current = value;
		},
	};
}

// A session keeps its assignment through every exit, so a follow-up resumes
// the saved conversation and the session keeps its place in the session
// list. A person ends it with an archive or a delete. The reason the
// process ended changes nothing here: the third call reports an exit that
// the runtime did not make for idleness.
test("a session keeps its assignment through both exit reconciliation paths", async () => {
	const f = await fixture();
	await closeExitedAssignments(ctx, async () => [f.saved]);
	let run = await ctx.newTx((tx) => getRun(tx, f.id));
	expect(run.closedAt).toBeNull();
	await refreshNative(ctx, run, async () => f.saved);
	run = await ctx.newTx((tx) => getRun(tx, f.id));
	expect(run.closedAt).toBeNull();
	await refreshNative(ctx, run, async () => ({ ...f.saved, stopReason: undefined }));
	expect((await ctx.newTx((tx) => getRun(tx, f.id))).closedAt).toBeNull();
	await closeExitedAssignments(ctx, async () => [{ ...f.saved, stopReason: undefined }]);
	expect((await ctx.newTx((tx) => getRun(tx, f.id))).closedAt).toBeNull();
});

test("a follow-up resumes the saved conversation with only the requested message", async () => {
	const f = await fixture();
	const input = {
		id: f.id,
		text: "Check the next file",
		messageId: crypto.randomUUID(),
		expectedTerminalId: f.terminalId,
	};
	expect(await prepareSend(ctx, input, f.deps)).toEqual({ id: f.id, launchedAt: at.toISOString() });
	expect(f.stats()).toEqual({ launches: 1, sends: 0, waits: 1, prompt: input.text });
	expect(f.stats().prompt).not.toContain("Original task");
	const run = await ctx.newTx((tx) => getRun(tx, f.id));
	expect(run.closedAt).toBeNull();
	expect(run.terminalId).not.toBe(f.terminalId);
	expect(run.sessionId).toBe(f.saved.agent!.sessionId);
	await prepareSend(ctx, input, f.deps);
	expect(f.stats().launches).toBe(1);
	expect(f.stats().sends).toBe(0);
	await expect(prepareSend(ctx, { ...input, text: "Different message" }, f.deps)).rejects.toThrow(
		"already belongs to another message",
	);
});

test("periodic idle nudges do not restart a stopped process", async () => {
	const f = await fixture();
	expect(await prepareSend(ctx, { id: f.id, text: "Reminder", idleForMs: 60_000 }, f.deps)).toEqual({
		id: f.id,
		skipped: true,
	});
	expect(f.stats().launches).toBe(0);
});

test("a stop between inspection and delivery resumes the rejected message", async () => {
	const f = await fixture();
	f.setCurrent({ ...f.saved, status: "running", stopReason: undefined, controllable: true });
	f.deps.host.send = async () => {
		throw Object.assign(new Error("Idle cutoff"), { code: "SESSION_IDLE_STOPPED" });
	};
	await prepareSend(ctx, { id: f.id, text: "New task" }, f.deps);
	expect(f.stats().launches).toBe(1);
	expect(f.stats().prompt).toBe("New task");
});

test("a normal exit does not trigger automatic resume", async () => {
	const f = await fixture();
	f.setCurrent({ ...f.saved, stopReason: undefined });
	await expect(prepareSend(ctx, { id: f.id, text: "Task" }, f.deps)).rejects.toThrow("cannot control");
	expect(f.stats().launches).toBe(0);
});

test("a stale target cannot wake a different attempt", async () => {
	const f = await fixture();
	await expect(prepareSend(ctx, { id: f.id, text: "Task", expectedTerminalId: "wrong" }, f.deps)).rejects.toThrow(
		"session changed",
	);
	expect(f.stats().launches).toBe(0);
});

test("unconfirmed resume input does not trigger another send", async () => {
	const f = await fixture();
	const input = { id: f.id, text: "Task", messageId: crypto.randomUUID() };
	await prepareSend(ctx, input, f.deps);
	f.setCurrent({ ...f.saved, acknowledgedMessageIds: [] });
	await expect(prepareSend(ctx, input, f.deps)).rejects.toThrow("no confirmed receipt");
	expect(f.stats().launches).toBe(1);
	expect(f.stats().sends).toBe(0);
});

test("an explicit stop during idle cleanup prevents automatic resume", async () => {
	const f = await fixture();
	waitFor.mockImplementation(async () => {
		await db.execute(sql`UPDATE agent_runs SET closed_at=${at} WHERE id=${f.id}`);
		return f.saved;
	});
	await expect(prepareSend(ctx, { id: f.id, text: "Task" }, f.deps)).rejects.toThrow("assignment closed");
	expect(f.stats().launches).toBe(0);
	expect((await ctx.newTx((tx) => getRun(tx, f.id))).closedAt).not.toBeNull();
});

test.each([false, true])("a confirmed message cannot repeat after expiry (delivery race: %s)", async (race) => {
	const f = await fixture();
	const messageId = crypto.randomUUID();
	const acknowledged = { ...f.saved, acknowledgedMessageIds: [f.terminalId, messageId] };
	if (race) {
		f.setCurrent({ ...f.saved, status: "running", stopReason: undefined, controllable: true });
		f.deps.host.send = async () => {
			f.setCurrent(acknowledged);
			throw Object.assign(new Error("Idle cutoff"), { code: "SESSION_IDLE_STOPPED" });
		};
	} else f.setCurrent(acknowledged);
	await prepareSend(ctx, { id: f.id, text: "Already delivered", messageId }, f.deps);
	expect(f.stats().launches).toBe(0);
});
