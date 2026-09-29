import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { startNative } from "../agentRuns/nativeStart.ts";
import { getRun } from "../agentRuns/queries.ts";
import { prepareResume } from "../agentRuns/resume.ts";
import { prepareRetry } from "../agentRuns/retry.ts";
import {
	beginSessionUpdateRequest,
	failOutstandingSessionUpdateRequestForRun,
	get as getSessionUpdates,
	setSessionUpdateRequestState,
	write,
} from "../sessionUpdates";
import type { IoCtx } from "../support.ts";

const at = new Date("2026-09-29T12:05:00.000Z");

const fixture = async (kind: "agent" | "session") => {
	const db = await openTestDb();
	const home = await mkdtemp(join(tmpdir(), "trellis-status-lifecycle-"));
	const projectId = ulid();
	const statusId = ulid();
	const ticketId = ulid();
	const runId = ulid();
	const sessionId = ulid();
	const terminalId = crypto.randomUUID();
	const token = crypto.randomUUID();
	const providerSessionId = crypto.randomUUID();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,directory,created_at,updated_at)
		VALUES (${projectId},'STA','status','Status',${home},${at},${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${projectId},'In Progress','in-progress','started','fg-muted',0,true,${at},${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id,project_id,number,title,status_id,position,created_at,updated_at)
		VALUES (${ticketId},${projectId},1,'Status request',${statusId},0,${at},${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_id,project_key,ticket_id,ticket_identifier,harness,terminal_id,
		session_id,workspace_id,created_at,updated_at)
		VALUES (${runId},'Status agent',${kind},'Work.',${kind === "agent" ? projectId : null},
		${kind === "agent" ? "STA" : ""},${kind === "agent" ? ticketId : null},
		${kind === "agent" ? "STA-1" : null},'{"preset":"codex"}'::jsonb,${terminalId},
		${providerSessionId},${home},${at},${at})`);
	await db.execute(sql`INSERT INTO sessions (id,name,directory,harness,run_id,created_at,updated_at)
		VALUES (${sessionId},'Status session',${home},'{"preset":"codex"}'::jsonb,${runId},${at},${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts
		(id,run_id,generation,token_hash,created_at) VALUES
		(${terminalId},${runId},1,${createHash("sha256").update(token).digest("hex")},${at})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const core: ServiceCtx = {
		actor: { kind: "human", name: "qa" },
		session: null,
		attemptToken: null,
		reqId: ulid(),
		now: at,
		emit: () => {},
		cache,
		actorCache: new Map(),
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	};
	const pending: Promise<unknown>[] = [];
	let io: IoCtx;
	io = {
		core,
		actor: core.actor!,
		session: null,
		home,
		localUrl: "http://127.0.0.1:4521",
		publicUrl: "http://127.0.0.1:4521",
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
		background: (action) => pending.push(action(io)),
	} as IoCtx;
	return { db, home, runId, sessionId, terminalId, providerSessionId, core, io, pending };
};

const beginSentRequest = async (value: Awaited<ReturnType<typeof fixture>>, requestId: string) => {
	await value.db.transaction((tx) =>
		beginSessionUpdateRequest(value.core, tx, { sessionId: value.sessionId, requestId }),
	);
	await value.db.transaction((tx) =>
		setSessionUpdateRequestState(value.core, tx, { sessionId: value.sessionId, requestId, state: "sent" }),
	);
};

const exitedProcess = (value: Awaited<ReturnType<typeof fixture>>): RuntimeProcessStatus => ({
	id: value.terminalId,
	daemonId: "runtime",
	pid: null,
	mode: "pty",
	status: "exited",
	startedAt: at.toISOString(),
	endedAt: at.toISOString(),
	exitCode: 0,
	error: null,
	elapsedMs: 300_000,
	agent: {
		sessionId: value.providerSessionId,
		model: null,
		turnId: null,
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: null,
		outcome: "completed",
	},
	activity: { state: "idle", updatedAt: at.toISOString() },
	checkedAt: at.toISOString(),
	controllable: false,
	process: null,
	launch: { command: "codex", args: [], cwd: value.home },
	acknowledgedMessageIds: [],
	result: null,
});

const saveLateReply = async (
	value: Awaited<ReturnType<typeof fixture>>,
	requestId: string,
	attempt: { token: string },
) => {
	const agentCore = {
		...value.core,
		actor: { kind: "agent" as const, name: value.runId },
		attemptToken: attempt.token,
	};
	await value.db.transaction((tx) =>
		write(agentCore, tx, { sessionId: value.sessionId, requestId, body: "The replacement saved the late reply." }),
	);
	await value.db.transaction((tx) =>
		failOutstandingSessionUpdateRequestForRun(value.core, tx, {
			runId: value.runId,
			error: "A later lifecycle check must preserve the reply.",
		}),
	);
	const saved = await value.db.transaction((tx) => getSessionUpdates(value.core, tx, { sessionId: value.sessionId }));
	expect(saved.latest?.body).toBe("The replacement saved the late reply.");
	expect(saved.request).toMatchObject({ requestId, state: "answered", error: null });
};

test("Resume replaces terminal A, clears its request, and preserves a late reply from terminal B", async () => {
	const value = await fixture("session");
	try {
		const requestId = crypto.randomUUID();
		await beginSentRequest(value, requestId);
		await mkdir(join(value.home, "harness-attempts", value.terminalId), { recursive: true });
		await writeFile(
			join(value.home, "harness-attempts", value.terminalId, "launch.json"),
			JSON.stringify({ harness: "codex", sessionId: value.providerSessionId, spec: { cwd: value.home } }),
		);
		let replacement!: { id: string; token: string };
		const start: typeof startNative = async (_ctx, input) => {
			replacement = input.attempt;
			return { id: value.runId, launchedAt: at.toISOString() };
		};
		await prepareResume(
			value.io,
			{
				id: value.runId,
				expectedTerminalId: value.terminalId,
				requestId: crypto.randomUUID(),
			},
			start,
			false,
			async () => exitedProcess(value),
		);
		const run = await value.db.transaction((tx) => getRun(tx, value.runId));
		expect(run.terminalId).toBe(replacement.id);
		const failed = await value.db.transaction((tx) =>
			getSessionUpdates(value.core, tx, { sessionId: value.sessionId }),
		);
		expect(failed.request).toMatchObject({ requestId, state: "failed" });
		await saveLateReply(value, requestId, replacement);
	} finally {
		await rm(value.home, { recursive: true, force: true });
		await value.db.$client.close();
	}
});

test("Retry replaces terminal A, clears its request, and preserves a late reply from terminal B", async () => {
	const value = await fixture("agent");
	try {
		const requestId = crypto.randomUUID();
		await beginSentRequest(value, requestId);
		let replacement!: { id: string; token: string };
		const start: typeof startNative = async (_ctx, input) => {
			replacement = input.attempt;
			return { id: value.runId, launchedAt: at.toISOString() };
		};
		await prepareRetry(
			value.io,
			{ id: value.runId, expectedTerminalId: value.terminalId, requestId: crypto.randomUUID() },
			start,
		);
		await Promise.all(value.pending);
		const run = await value.db.transaction((tx) => getRun(tx, value.runId));
		expect(run.terminalId).toBe(replacement.id);
		const failed = await value.db.transaction((tx) =>
			getSessionUpdates(value.core, tx, { sessionId: value.sessionId }),
		);
		expect(failed.request).toMatchObject({ requestId, state: "failed" });
		await saveLateReply(value, requestId, replacement);
	} finally {
		await rm(value.home, { recursive: true, force: true });
		await value.db.$client.close();
	}
});
