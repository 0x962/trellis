import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareResume } from "../agentRuns/resume.ts";
import type { IoCtx } from "../support.ts";
import { prepareSetArchived } from "./archive.ts";
import { move } from "./move.ts";
import { getSession } from "./queries.ts";
import { prepareStart } from "./start.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: CoreCtx;
let ctx: IoCtx;
const at = new Date("2026-09-23T12:00:00Z");
const projectId = ulid();
const bareRunId = ulid();
const bareSessionId = ulid();
const runningRunId = ulid();
const runningSessionId = ulid();
const projectRunId = ulid();
const projectSessionId = ulid();
const runningTerminalId = crypto.randomUUID();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// The record the runtime keeps for one process. `status` is "running" while
// the process writes in the session directory. A process that ended reads
// "exited", and `stopReason` is "idle" when the runtime ended it for idleness
// and keeps its record for a resume.
const processStatus = (status: "running" | "exited", stopReason?: "idle"): RuntimeProcessStatus => ({
	id: runningTerminalId,
	daemonId: "test",
	pid: null,
	mode: "pty",
	status,
	...(stopReason === undefined ? {} : { stopReason }),
	startedAt: at.toISOString(),
	endedAt: status === "exited" ? at.toISOString() : null,
	exitCode: null,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: 0,
	controllable: status === "running",
	process: null,
	launch: { command: "claude", args: [], cwd: "/nowhere" },
	agent: null,
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
});

// A stop the runtime completed. The real function ends the process and closes
// the run; this one records the run it received.
const stopped: string[] = [];
const stopRun = async (_ctx: unknown, target: { id: string }) => {
	stopped.push(target.id);
	return { id: target.id };
};

// The runtime holds no record of this process. A closed run then needs no
// stop, and the service writes the archive time alone.
const noProcess = { process: async () => null, stop: stopRun };

// The runtime answers a call the service must not make.
const refuseProcess = {
	process: async (): Promise<null> => {
		throw new Error("the service read the runtime for a session it had no work to do on");
	},
	stop: stopRun,
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${projectId}, 'ARC', 'archive', 'Archive', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, harness, terminal_id, closed_at, created_at, updated_at) VALUES
		(${bareRunId}, 'bare', 'session', 'Work', NULL, '', '{"preset":"claude"}'::jsonb, NULL, ${at}, ${at}, ${at}),
		(${runningRunId}, 'running', 'session', 'Work', NULL, '', '{"preset":"claude"}'::jsonb, ${runningTerminalId}, NULL, ${at}, ${at}),
		(${projectRunId}, 'owned', 'session', 'Work', ${projectId}, 'ARC', '{"preset":"claude"}'::jsonb, NULL, ${at}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at) VALUES
		(${bareSessionId}, 'bare', '/tmp/bare', '{"preset":"claude"}'::jsonb, ${bareRunId}, ${at}, ${at}),
		(${runningSessionId}, 'running', '/tmp/running', '{"preset":"claude"}'::jsonb, ${runningRunId}, ${at}, ${at}),
		(${projectSessionId}, 'owned', '/tmp/owned', '{"preset":"claude"}'::jsonb, ${projectRunId}, ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	core = {
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
		home: "/nowhere",
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
		background: () => {},
		vacuum: async () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
	};
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

const closedAt = async (runId: string) =>
	(
		await run((tx) => rows<{ closed_at: string | null }>(tx, sql`SELECT closed_at FROM agent_runs WHERE id = ${runId}`))
	)[0]!.closed_at;

test("an archive stamps the session and keeps its directory", async () => {
	const archived = await prepareSetArchived(ctx, { id: bareSessionId, archived: true }, noProcess);

	expect(archived.archivedAt).toBe(at.toISOString());
	expect(archived.directory).toBe("/tmp/bare");
	expect(await run((tx) => getSession(tx, bareSessionId))).toMatchObject({ archivedAt: at.toISOString() });
});

test("a second archive of the same session reads no runtime and writes nothing", async () => {
	const again = await prepareSetArchived(ctx, { id: bareSessionId, archived: true }, refuseProcess);

	expect(again.archivedAt).toBe(at.toISOString());
});

// prepareStart reads archived_at before it calls the runtime, so this test
// needs no runtime double.
test("an archived session starts no agent", async () => {
	await expect(prepareStart(ctx, { id: bareSessionId })).rejects.toThrow(
		"An archived session runs no agent. Bring the session back first.",
	);
});

test("an archived session joins no project", async () => {
	await expect(run((tx) => move(core, tx, { id: bareSessionId, project: "ARC" }))).rejects.toThrow(
		"An archived session belongs to no project. Bring the session back first.",
	);
});

test("an unarchive clears the stamp", async () => {
	const restored = await prepareSetArchived(ctx, { id: bareSessionId, archived: false }, noProcess);

	expect(restored.archivedAt).toBeNull();
	expect(await run((tx) => getSession(tx, bareSessionId))).toMatchObject({ archivedAt: null });
});

test("a session of a project cannot be archived", async () => {
	await expect(prepareSetArchived(ctx, { id: projectSessionId, archived: true }, noProcess)).rejects.toThrow(
		"A session of a project cannot be archived. Move the session out of the project first.",
	);
});

test("an archive stops the agent of a session whose process runs", async () => {
	stopped.length = 0;
	await prepareSetArchived(
		ctx,
		{ id: runningSessionId, archived: true },
		{ process: async () => processStatus("running"), stop: stopRun },
	);

	expect(stopped).toEqual([runningRunId]);
});

test("an archive closes the run of a session whose process already exited", async () => {
	await prepareSetArchived(ctx, { id: runningSessionId, archived: false }, noProcess);
	expect(await closedAt(runningRunId)).toBeNull();

	await prepareSetArchived(
		ctx,
		{ id: runningSessionId, archived: true },
		{
			process: async () => processStatus("exited"),
			stop: async () => {
				throw new Error("the service stopped a process that had already exited");
			},
		},
	);

	expect(await closedAt(runningRunId)).not.toBeNull();
});

test("an archive stops a process the runtime ended for idleness", async () => {
	stopped.length = 0;
	await prepareSetArchived(ctx, { id: runningSessionId, archived: false }, noProcess);

	await prepareSetArchived(
		ctx,
		{ id: runningSessionId, archived: true },
		{ process: async () => processStatus("exited", "idle"), stop: stopRun },
	);

	expect(stopped).toEqual([runningRunId]);
});

// The archive of a session keeps its attempt, so the runtime still holds a
// record that a resume could take. The resume reads archived_at before it
// reads the runtime.
test("an archived session resumes no agent", async () => {
	await prepareSetArchived(ctx, { id: bareSessionId, archived: true }, noProcess);

	await expect(
		prepareResume(ctx, { id: bareRunId, expectedTerminalId: "attempt", requestId: crypto.randomUUID() }),
	).rejects.toThrow("An archived session runs no agent. Bring the session back first.");

	await prepareSetArchived(ctx, { id: bareSessionId, archived: false }, noProcess);
});

// A move can write the project of the run while the archive waits for the
// agent to stop. The UPDATE reads the project again, so the session keeps no
// archive time.
test("an archive refuses a session that gained a project while its agent stopped", async () => {
	const moved = async () => {
		await db.execute(sql`UPDATE agent_runs SET project_id = ${projectId}, project_key = 'ARC' WHERE id = ${bareRunId}`);
		return null;
	};

	await expect(
		prepareSetArchived(ctx, { id: bareSessionId, archived: true }, { process: moved, stop: stopRun }),
	).rejects.toThrow("A session of a project cannot be archived. Move the session out of the project first.");

	expect(await run((tx) => getSession(tx, bareSessionId))).toMatchObject({ archivedAt: null });
	await db.execute(sql`UPDATE agent_runs SET project_id = NULL, project_key = '' WHERE id = ${bareRunId}`);
});
