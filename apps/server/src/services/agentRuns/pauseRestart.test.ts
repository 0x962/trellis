import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { startNative } from "../agentRuns/nativeStart.ts";
import { prepareStart } from "../sessions/start.ts";
import type { IoCtx } from "../support.ts";
import { attemptCapturePath } from "./attemptCapture.ts";
import { getRun } from "./queries.ts";
import { stopRunProcess } from "./stopRunProcess.ts";

// What a pause leaves behind, and what a restart of the execution service
// takes away.
//
// A pause stops the process and keeps the run open. The execution service
// keeps the record of an exited terminal in memory alone, so after it starts
// again it answers `null` for that terminal. Every test here drives that
// state: the runtime double answers `null`, and the only difference between
// a paused attempt and a launch nobody can vouch for is the output file that
// `stopNative` wrote after the service confirmed the exit.
let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
let home: string;
let pending: Promise<unknown>[] = [];
const at = new Date("2026-09-24T21:00:00Z");
const providerSessionId = "01a0d138-51be-7a31-9efc-e087042b1d31";

const seed = async (fields: { terminalId: string | null; sessionId: string | null }) => {
	const runId = ulid();
	const sessionRowId = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, harness, terminal_id, session_id, closed_at, created_at, updated_at)
		VALUES (${runId}, ${`run-${runId}`}, 'session', 'Work', NULL, '', '{"preset":"claude"}'::jsonb,
		${fields.terminalId}, ${fields.sessionId}, NULL, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${sessionRowId}, ${`session-${sessionRowId}`}, ${join(home, "work")}, '{"preset":"claude"}'::jsonb, ${runId}, ${at}, ${at})`);
	return { runId, sessionRowId };
};

// The file `stopNative` writes after the execution service confirms that the
// process of this attempt ended.
const writeCapture = async (runId: string, terminalId: string) => {
	const capture = attemptCapturePath(home, runId, terminalId);
	await mkdir(dirname(capture), { recursive: true });
	await writeFile(capture, "the agent said goodbye\n");
};

const storedRun = (id: string) => db.transaction((tx) => getRun(tx, id));

const closedAt = async (runId: string) =>
	(
		await db.transaction((tx) =>
			rows<{ closed_at: Date | null }>(tx, sql`SELECT closed_at FROM agent_runs WHERE id = ${runId}`),
		)
	)[0]!.closed_at;

// The execution service after a restart: it holds no record of any terminal.
const forgotten = async () => null;

beforeAll(async () => {
	db = await openTestDb();
	home = await mkdtemp(join(tmpdir(), "trellis-pause-restart-test-"));
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const core: CoreCtx = {
		actor: { kind: "human", name: "qa" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	ctx = {
		core,
		actor: core.actor!,
		session: null,
		home,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		localUrl: "http://localhost:4597",
		publicUrl: "http://localhost:4597",
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		// `launchSession` hands the harness launch to this function. The tests
		// await the collected promises, so the recorded launch input is ready
		// when they read it.
		background: (action) => {
			pending.push(action(ctx));
		},
		vacuum: async () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
	};
}, 60_000);

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("a start refuses an attempt that no capture and no runtime record vouch for", async () => {
	const { runId, sessionRowId } = await seed({ terminalId: crypto.randomUUID(), sessionId: providerSessionId });

	await expect(
		prepareStart(ctx, { id: sessionRowId }, { process: forgotten, start: async () => ({ id: runId }), preset: async () => "claude" }),
	).rejects.toThrow("The prior launch is not confirmed");
});

// The proof that a pause survives a restart of the execution service. The
// launch takes `resume` and the attempt it continues, and the run keeps the
// provider conversation it held.
test("a start after a restart resumes the provider conversation of a paused session", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await seed({ terminalId, sessionId: providerSessionId });
	await writeCapture(runId, terminalId);
	const launches: Parameters<typeof startNative>[1][] = [];
	pending = [];

	await prepareStart(
		ctx,
		{ id: sessionRowId },
		{
			process: forgotten,
			start: async (_background, input) => {
				launches.push(input);
				return { id: runId };
			},
			preset: async () => "claude",
		},
	);
	await Promise.all(pending);

	expect(launches).toHaveLength(1);
	expect(launches[0]).toMatchObject({ resume: true, previousAttemptId: terminalId });
	const stored = await storedRun(runId);
	expect(stored.sessionId).toBe(providerSessionId);
	expect(stored.terminalId).not.toBe(terminalId);
	expect(stored.closedAt).toBeNull();
});

// An attempt that never confirmed a provider conversation has none to keep,
// so the session starts fresh in the same directory.
test("a start after a restart keeps no conversation the run never held", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await seed({ terminalId, sessionId: null });
	await writeCapture(runId, terminalId);
	const launches: Parameters<typeof startNative>[1][] = [];
	pending = [];

	await prepareStart(
		ctx,
		{ id: sessionRowId },
		{
			process: forgotten,
			start: async (_background, input) => {
				launches.push(input);
				return { id: runId };
			},
			preset: async () => "claude",
		},
	);
	await Promise.all(pending);

	expect(launches[0]).toMatchObject({ resume: false, previousAttemptId: null });
});

test("an archive refuses an attempt that no capture and no runtime record vouch for", async () => {
	const terminalId = crypto.randomUUID();
	const { runId } = await seed({ terminalId, sessionId: providerSessionId });
	const run = await storedRun(runId);

	await expect(
		stopRunProcess(ctx, run, {
			process: forgotten,
			stop: async () => {
				throw new Error("the service stopped a process it could not read");
			},
		}),
	).rejects.toThrow("The prior launch is not confirmed");
});

// The proof that an archive of a paused session works after a restart. It
// stops nothing, because the process already ended, and it closes the run.
test("an archive after a restart closes the run of a paused session", async () => {
	const terminalId = crypto.randomUUID();
	const { runId } = await seed({ terminalId, sessionId: providerSessionId });
	await writeCapture(runId, terminalId);
	const run = await storedRun(runId);

	await stopRunProcess(ctx, run, {
		process: forgotten,
		stop: async () => {
			throw new Error("the service stopped a process that had already ended");
		},
	});

	expect(await closedAt(runId)).not.toBeNull();
});
