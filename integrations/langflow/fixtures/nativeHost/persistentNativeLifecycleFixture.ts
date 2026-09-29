import { spyOn } from "bun:test";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../../../apps/server/src/agents/harnessHost/harnessHost.ts";
import { taskKey } from "../../../../apps/server/src/agents/nativeFlow/taskKey.ts";
import type { HarnessSnapshot } from "../../../../apps/server/src/agents/nativeHarness/types.ts";
import type { ServiceCtx as CoreCtx } from "../../../../apps/server/src/context.ts";
import { createCache } from "../../../../apps/server/src/db/cache.ts";
import { openDatabase } from "../../../../apps/server/src/db/open.ts";
import { rows } from "../../../../apps/server/src/db/queries/support.ts";
import type { Tx } from "../../../../apps/server/src/db/tx.ts";
import { startNative } from "../../../../apps/server/src/services/agentRuns/nativeStart.ts";
import { observeAttempt } from "../../../../apps/server/src/services/agentRuns/observeAttempt";
import { getRun } from "../../../../apps/server/src/services/agentRuns/queries.ts";
import { readNativeHarness } from "../../../../apps/server/src/services/agentRuns/readNativeHarness.ts";
import { claimNext } from "../../../../apps/server/src/services/flowExecutions/claimNext.ts";
import { readExecution } from "../../../../apps/server/src/services/flowExecutions/queries.ts";
import { recordTaskLaunch } from "../../../../apps/server/src/services/flowExecutions/recordTaskLaunch.ts";
import { recordTaskObservation } from "../../../../apps/server/src/services/flowExecutions/recordTaskObservation.ts";
import type { FlowCtx } from "../../../../apps/server/src/services/flowExecutions/types.ts";
import { readBridgeStep, reserveBridgeStep } from "./bridgeReservationFixture.ts";
import { DeterministicProcessHost, type ProcessWriteBoundary } from "./deterministicProcess.ts";
import { nativeRequestForStep } from "./nativeRequestFixture.ts";

type Claim = NonNullable<Awaited<ReturnType<typeof claimNext>>>;

type Metadata = {
	executionId: string;
	at: string;
};

export type CrashBoundaryEvidence = {
	executionId: string;
	stepId: string;
	taskKey: string;
	agentRunId: string;
	attemptId: string;
	nativePid: number | null;
	launchedAt: string | null;
	acknowledged: boolean;
	taskRows: number;
	bindingRows: number;
	attemptRows: number;
	resultId: string | null;
	executionStatus: string;
};

const metadataPath = (home: string) => join(home, "fixture.json");
const claimPath = (home: string) => join(home, "claim.json");
const dbPath = (home: string) => join(home, "db");
const processPath = (home: string) => join(home, "native-processes");

const writeJson = async (path: string, value: unknown) => {
	const temporary = `${path}-${crypto.randomUUID()}.next`;
	await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
	await rename(temporary, path);
};

const coreContext = async (db: Awaited<ReturnType<typeof openDatabase>>["db"], at: Date): Promise<CoreCtx> => {
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	return {
		actor: { kind: "agent", name: "Crash fixture" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
};

const flowContext = (home: string, core: CoreCtx, db: Awaited<ReturnType<typeof openDatabase>>["db"], at: Date) =>
	({
		core,
		actor: core.actor!,
		session: null,
		home,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: "boot-native-lifecycle-crash",
		localUrl: "http://localhost:4597",
		ghStatus: () => ({ ok: true, user: "fixture", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		background: () => {},
		vacuum: async () => {},
		now: () => at,
		newTx: (fn) => db.transaction(fn),
		emit: () => {},
	}) as FlowCtx;

export async function openPersistentNativeLifecycleFixture(home: string, boundary?: ProcessWriteBoundary) {
	const metadata = JSON.parse(await readFile(metadataPath(home), "utf8")) as Metadata;
	const at = new Date(metadata.at);
	const database = await openDatabase(dbPath(home));
	const core = await coreContext(database.db, at);
	const ctx = flowContext(home, core, database.db, at);
	const processes = await DeterministicProcessHost.create(processPath(home), () => at.toISOString(), boundary);
	const prepare = spyOn(HarnessHost.prototype, "prepare").mockImplementation(async (input) => ({
		fingerprint: JSON.stringify([input.harness, input.model, input.effort, null]),
		prompt: input.prompt,
		spec: { id: input.id, command: "fixture-agent", args: [], cwd: home, env: {}, mode: "pty" },
		harness: input.harness,
	}));
	const start = spyOn(HarnessHost.prototype, "start").mockImplementation(async (input) => processes.launch(input));
	const run = <T>(fn: (tx: Tx) => Promise<T>) => database.db.transaction(fn);
	const evidence = async (): Promise<CrashBoundaryEvidence> => {
		const task = (
			await database.db.execute(
				sql`SELECT t.key,t.run_id,t.attempt_id,t.result_id,r.launched_at
				FROM flow_execution_tasks t JOIN agent_runs r ON r.id=t.run_id
				WHERE t.execution_id=${metadata.executionId}`,
			)
		).rows[0] as
			| { key: string; run_id: string; attempt_id: string; result_id: string | null; launched_at: string | null }
			| undefined;
		const bindings = await database.db.execute(
			sql`SELECT step_id FROM langflow_native_reservations_fixture WHERE execution_id=${metadata.executionId}`,
		);
		const attempts =
			task === undefined
				? { rows: [] }
				: await database.db.execute(sql`SELECT id FROM agent_execution_attempts WHERE run_id=${task.run_id}`);
		const bridge = task === undefined ? null : await run((tx) => readBridgeStep(tx, metadata.executionId, task.key));
		const processStatus =
			task === undefined || !(await Bun.file(join(processPath(home), `${task.attempt_id}.json`)).exists())
				? null
				: await processes.inspect(task.attempt_id);
		const execution = await run((tx) => readExecution(tx, metadata.executionId));
		return {
			executionId: metadata.executionId,
			stepId: bridge?.stepId ?? "",
			taskKey: task?.key ?? "",
			agentRunId: task?.run_id ?? "",
			attemptId: task?.attempt_id ?? "",
			nativePid: processStatus?.pid ?? null,
			launchedAt: task?.launched_at ?? null,
			acknowledged: processStatus?.acknowledgedMessageIds.includes(task?.attempt_id ?? "") ?? false,
			taskRows: task === undefined ? 0 : 1,
			bindingRows: bindings.rows.length,
			attemptRows: attempts.rows.length,
			resultId: task?.result_id ?? null,
			executionStatus: execution.state.status,
		};
	};
	const reserve = async (pauseBeforeCommit?: (input: CrashBoundaryEvidence) => Promise<void>) => {
		const claim = await run(async (tx) => {
			const claimed = await claimNext(core, tx, { id: metadata.executionId });
			if (claimed === null) throw new Error("missing_native_claim");
			const current = await readExecution(tx, metadata.executionId);
			const step = current.state.steps.find((candidate) => taskKey(candidate) === claimed.key)!;
			const request = nativeRequestForStep(metadata.executionId, current.state.steps, step);
			const bridge = await reserveBridgeStep(tx, {
				executionId: metadata.executionId,
				taskKey: claimed.key,
				nodeId: step.nodeId,
				parentKey: step.parentKey,
				iteration: step.iteration,
				phase: step.phase,
				round: step.round,
				agentRunId: claimed.run.id,
				attemptId: claimed.attempt.id,
				requestBytes: JSON.stringify(request),
			});
			if (pauseBeforeCommit !== undefined) {
				const tasks = await rows<{ count: number }>(
					tx,
					sql`SELECT count(*)::int AS count FROM flow_execution_tasks WHERE execution_id=${metadata.executionId}`,
				);
				const bindings = await rows<{ count: number }>(
					tx,
					sql`SELECT count(*)::int AS count FROM langflow_native_reservations_fixture WHERE execution_id=${metadata.executionId}`,
				);
				await pauseBeforeCommit({
					executionId: metadata.executionId,
					stepId: bridge.stepId,
					taskKey: claimed.key,
					agentRunId: claimed.run.id,
					attemptId: claimed.attempt.id,
					nativePid: null,
					launchedAt: null,
					acknowledged: false,
					taskRows: tasks[0]!.count,
					bindingRows: bindings[0]!.count,
					attemptRows: 1,
					resultId: null,
					executionStatus: current.state.status,
				});
			}
			return { ...claimed, bridge };
		});
		await writeJson(claimPath(home), claim);
		return claim;
	};
	const readClaim = async () =>
		JSON.parse(await readFile(claimPath(home), "utf8")) as Claim & {
			bridge: NonNullable<Awaited<ReturnType<typeof readBridgeStep>>>;
		};
	const claimAgain = () => run((tx) => claimNext(core, tx, { id: metadata.executionId }));
	const launch = async (claim: Claim) =>
		startNative(ctx, claim, {
			workspace: async () => home,
			runtime: async () => processes.client() as never,
			guide: async () => "Run the persistent native lifecycle fixture.",
			env: {},
		});
	const recordLaunch = (claim: Claim, launchedAt: string) =>
		run((tx) =>
			recordTaskLaunch(core, tx, {
				id: metadata.executionId,
				key: claim.key,
				attemptId: claim.attempt.id,
				launchedAt: Date.parse(launchedAt),
			}),
		);
	const snapshot = async (claim: Claim) => {
		const storedRun = await run((tx) => getRun(tx, claim.run.id));
		const value = await readNativeHarness(ctx, storedRun, processes.client() as never);
		if (value === null) throw new Error("missing_native_snapshot");
		return value;
	};
	const recordObservation = async (
		claim: Claim,
		value: HarnessSnapshot,
		pauseBeforeCommit?: (input: CrashBoundaryEvidence) => Promise<void>,
	) => {
		const attempt = await observeAttempt(
			{ newTx: run },
			{ runId: claim.run.id, attemptId: claim.attempt.id, sessionId: value.sessionId },
		);
		const stable = await evidence();
		return run(async (tx) => {
			const recorded = await recordTaskObservation(core, tx, {
				id: metadata.executionId,
				key: claim.key,
				attemptId: claim.attempt.id,
				attempt,
				snapshot: value,
			});
			if (pauseBeforeCommit !== undefined) {
				const task = await rows<{ result_id: string | null }>(
					tx,
					sql`SELECT result_id FROM flow_execution_tasks
					WHERE execution_id=${metadata.executionId} AND key=${claim.key}`,
				);
				const bindings = await rows<{ count: number }>(
					tx,
					sql`SELECT count(*)::int AS count FROM langflow_native_reservations_fixture
					WHERE execution_id=${metadata.executionId}`,
				);
				await pauseBeforeCommit({
					...stable,
					taskRows: task.length,
					bindingRows: bindings[0]!.count,
					resultId: task[0]!.result_id,
				});
			}
			return recorded;
		});
	};
	return {
		metadata,
		ctx,
		processes,
		reserve,
		readClaim,
		claimAgain,
		launch,
		recordLaunch,
		snapshot,
		recordObservation,
		evidence,
		close: async () => {
			prepare.mockRestore();
			start.mockRestore();
			await database.close();
		},
	};
}
