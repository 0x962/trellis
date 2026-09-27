import { afterAll, beforeAll } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { rows } from "../../../db/queries/support.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { IoCtx } from "../../support.ts";
import { attemptCapturePath } from "../attemptCapture.ts";
import { closeExitedAssignments } from "../closeExitedAssignments.ts";
import { getRun } from "../queries.ts";

const at = new Date("2026-09-24T21:00:00Z");
const providerSessionId = "01a0d138-51be-7a31-9efc-e087042b1d31";

export const pauseRestartFixture = () => {
	let db: Awaited<ReturnType<typeof openTestDb>>;
	let ctx: IoCtx;
	let home: string;
	let pending: Promise<unknown>[] = [];

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

	const forgotten = async () => null;

	const exitedOnItsOwn = (terminalId: string): RuntimeProcessStatus => ({
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
		launch: { command: "claude", args: [], cwd: "/nowhere" },
		agent: null,
		activity: null,
		acknowledgedMessageIds: [],
		result: null,
	});

	const reconcile = (terminalId: string) =>
		closeExitedAssignments(
			ctx,
			async () => [exitedOnItsOwn(terminalId)],
			async () => "the agent finished its work\n",
		);

	const reconcileWithoutOutput = (terminalId: string) =>
		closeExitedAssignments(
			ctx,
			async () => [exitedOnItsOwn(terminalId)],
			async () => {
				throw new Error("the execution service dropped this terminal");
			},
		);

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
			installationHome: home,
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

	return {
		providerSessionId,
		seed,
		writeCapture,
		storedRun,
		closedAt,
		forgotten,
		reconcile,
		reconcileWithoutOutput,
		context: () => ctx,
		resetPending: () => {
			pending = [];
		},
		waitForPending: () => Promise.all(pending),
	};
};
