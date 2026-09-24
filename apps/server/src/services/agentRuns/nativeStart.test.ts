import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../agents/harnessHost/harnessHost.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { rows } from "../../db/queries/support.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { IoCtx } from "../support.ts";
import { startNative } from "./nativeStart.ts";
import { getRun } from "./queries.ts";

// The last writer of `closed_at` on the launch path. A harness can confirm
// its provider session and then end before the launch observation finishes,
// and this writer then sees an exited process. A session keeps its
// assignment through that exit, the same as through every other one, so the
// session list keeps the session and a person resumes it.
let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
let home: string;
const at = new Date("2026-09-24T21:00:00Z");
const prepare = spyOn(HarnessHost.prototype, "prepare");
const start = spyOn(HarnessHost.prototype, "start");

const exitedProcess = (terminalId: string): RuntimeProcessStatus => ({
	id: terminalId,
	daemonId: "test",
	pid: null,
	mode: "pty",
	status: "exited",
	startedAt: at.toISOString(),
	endedAt: at.toISOString(),
	exitCode: 0,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: 0,
	controllable: false,
	process: null,
	launch: { command: "muse", args: [], cwd: "/nowhere" },
	agent: {
		sessionId: "01a0d138-51be-7a31-9efc-e087042b1d31",
		model: null,
		turnId: null,
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: null,
		outcome: "completed",
	},
	activity: null,
	acknowledgedMessageIds: [terminalId],
	result: null,
});

const seed = async (kind: "session" | "flow") => {
	const id = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, harness, terminal_id, created_at, updated_at)
		VALUES (${id}, ${`run-${id}`}, ${kind}, 'Do the work', '', '{"preset":"muse"}'::jsonb, NULL, ${at}, ${at})`);
	return id;
};

const closedAt = async (id: string) =>
	(
		await db.transaction((tx) =>
			rows<{ closed_at: Date | null }>(tx, sql`SELECT closed_at FROM agent_runs WHERE id = ${id}`),
		)
	)[0]!.closed_at;

// The launch never reaches the runtime client, because the two spies answer
// for the harness host. Only `client.stop` runs, and only for a resume of an
// attempt the runtime ended for idleness, which no test here does.
const client = {} as RuntimeClient;

const launch = async (runId: string) => {
	const terminalId = crypto.randomUUID();
	start.mockImplementation(async () => ({ process: exitedProcess(terminalId) }));
	const run = await db.transaction((tx) => getRun(tx, runId));
	await db.execute(sql`UPDATE agent_runs SET terminal_id = ${terminalId} WHERE id = ${runId}`);
	await startNative(
		ctx,
		{
			run: { ...run, terminalId },
			config: {
				directory: home,
				harness: { preset: "muse", startCommand: "muse {{prompt}}", resumeCommand: "muse resume {{resumeText}}" },
				accountId: null,
			},
			resume: false,
			attempt: { id: terminalId, generation: 1, token: "launch-token" },
		},
		{ workspace: async () => home, runtime: async () => client, env: {} },
	);
	return terminalId;
};

beforeAll(async () => {
	db = await openTestDb();
	home = await mkdtemp(join(tmpdir(), "trellis-native-start-test-"));
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	prepare.mockImplementation(async () => ({
		fingerprint: JSON.stringify(["muse", null, null, null]),
		prompt: "",
		spec: { id: "spec", command: "muse", args: [], cwd: home, env: {}, mode: "pty" },
		harness: "muse",
	}));
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
		background: () => {},
		vacuum: async () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
	};
}, 60_000);

afterAll(async () => {
	prepare.mockRestore();
	start.mockRestore();
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("a launch that ends at once keeps the assignment of a session", async () => {
	const runId = await seed("session");

	await launch(runId);

	expect(await closedAt(runId)).toBeNull();
});

test("a launch that ends at once closes a flow run", async () => {
	const runId = await seed("flow");

	await launch(runId);

	expect(await closedAt(runId)).not.toBeNull();
});
