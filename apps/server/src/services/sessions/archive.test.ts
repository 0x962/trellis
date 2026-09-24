import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
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
const bareRowId = ulid();
const runningRunId = ulid();
const runningRowId = ulid();
const projectRunId = ulid();
const projectRowId = ulid();
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
		(${bareRowId}, 'bare', '/tmp/bare', '{"preset":"claude"}'::jsonb, ${bareRunId}, ${at}, ${at}),
		(${runningRowId}, 'running', '/tmp/running', '{"preset":"claude"}'::jsonb, ${runningRunId}, ${at}, ${at}),
		(${projectRowId}, 'owned', '/tmp/owned', '{"preset":"claude"}'::jsonb, ${projectRunId}, ${at}, ${at})`);
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
	const archived = await prepareSetArchived(ctx, { id: bareRowId, archived: true }, noProcess);

	expect(archived.archivedAt).toBe(at.toISOString());
	expect(archived.directory).toBe("/tmp/bare");
	expect(await run((tx) => getSession(tx, bareRowId))).toMatchObject({ archivedAt: at.toISOString() });
});

test("a second archive of the same session reads no runtime and writes nothing", async () => {
	const again = await prepareSetArchived(ctx, { id: bareRowId, archived: true }, refuseProcess);

	expect(again.archivedAt).toBe(at.toISOString());
});

// The refusal comes before the service reads the runtime, so the call takes
// the runtime functions it holds by default and reaches none of them.
test("an archived session starts no agent", async () => {
	await expect(prepareStart(ctx, { id: bareRowId })).rejects.toThrow(
		"An archived session runs no agent. Bring the session back first.",
	);
});

test("an archived session joins no project", async () => {
	await expect(run((tx) => move(core, tx, { id: bareRowId, project: "ARC" }))).rejects.toThrow(
		"An archived session belongs to no project. Bring the session back first.",
	);
});

test("an unarchive clears the stamp", async () => {
	const restored = await prepareSetArchived(ctx, { id: bareRowId, archived: false }, noProcess);

	expect(restored.archivedAt).toBeNull();
	expect(await run((tx) => getSession(tx, bareRowId))).toMatchObject({ archivedAt: null });
});

test("a session of a project cannot be archived", async () => {
	await expect(prepareSetArchived(ctx, { id: projectRowId, archived: true }, noProcess)).rejects.toThrow(
		"A session of a project cannot be archived. Move the session out of the project first.",
	);
});

test("an archive stops the agent of a session whose process runs", async () => {
	stopped.length = 0;
	await prepareSetArchived(
		ctx,
		{ id: runningRowId, archived: true },
		{ process: async () => processStatus("running"), stop: stopRun },
	);

	expect(stopped).toEqual([runningRunId]);
});

test("an archive closes the run of a session whose process already exited", async () => {
	await prepareSetArchived(ctx, { id: runningRowId, archived: false }, noProcess);
	expect(await closedAt(runningRunId)).toBeNull();

	await prepareSetArchived(
		ctx,
		{ id: runningRowId, archived: true },
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
	await prepareSetArchived(ctx, { id: runningRowId, archived: false }, noProcess);

	await prepareSetArchived(
		ctx,
		{ id: runningRowId, archived: true },
		{ process: async () => processStatus("exited", "idle"), stop: stopRun },
	);

	expect(stopped).toEqual([runningRunId]);
});
