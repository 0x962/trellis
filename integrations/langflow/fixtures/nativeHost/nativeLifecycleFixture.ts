import { spyOn } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowEdge, FlowNode } from "@trellis/api";
import { sql } from "drizzle-orm";
import { HarnessHost } from "../../../../apps/server/src/agents/harnessHost/harnessHost.ts";
import { edge, node } from "../../../../apps/server/src/agents/nativeFlow/testDoc.ts";
import type { HarnessSnapshot } from "../../../../apps/server/src/agents/nativeHarness/types.ts";
import { refreshNative } from "../../../../apps/server/src/services/agentRuns/nativeLifecycle.ts";
import { startNative } from "../../../../apps/server/src/services/agentRuns/nativeStart.ts";
import { observeAttempt } from "../../../../apps/server/src/services/agentRuns/observeAttempt";
import { getRun, type LaunchRun } from "../../../../apps/server/src/services/agentRuns/queries.ts";
import { readNativeHarness } from "../../../../apps/server/src/services/agentRuns/readNativeHarness.ts";
import { cancel } from "../../../../apps/server/src/services/flowExecutions/cancel.ts";
import { claimNext } from "../../../../apps/server/src/services/flowExecutions/claimNext.ts";
import { decide } from "../../../../apps/server/src/services/flowExecutions/decide.ts";
import { drainFlowStops } from "../../../../apps/server/src/services/flowExecutions/drainFlowStops.ts";
import { prepareFlowReconcile } from "../../../../apps/server/src/services/flowExecutions/prepareFlowReconcile.ts";
import { readExecution } from "../../../../apps/server/src/services/flowExecutions/queries.ts";
import { recordTaskLaunch } from "../../../../apps/server/src/services/flowExecutions/recordTaskLaunch.ts";
import { recordTaskObservation } from "../../../../apps/server/src/services/flowExecutions/recordTaskObservation.ts";
import { testFixture } from "../../../../apps/server/src/services/flowExecutions/testFixture";
import type { FlowCtx } from "../../../../apps/server/src/services/flowExecutions/types.ts";
import { save as saveFlow } from "../../../../apps/server/src/services/flows/save.ts";
import { DeterministicProcessHost } from "./deterministicProcess.ts";

type Claim = NonNullable<Awaited<ReturnType<typeof claimNext>>>;

export const defaultFlow = () => ({ nodes: [node("agent", "agent", null)], edges: [] as FlowEdge[] });

export const nestedFlow = () => {
	const nodes = [
		node("outer", "group", null, { minutes: 2880 }),
		node("inner", "group", "outer", { minutes: 20 }),
		node("first", "agent", "inner"),
		node("second", "agent", "inner"),
	];
	return { nodes, edges: [edge("first", "second")] };
};

export const humanFlow = () => ({ nodes: [node("human", "human", null)], edges: [] as FlowEdge[] });

export async function nativeLifecycleFixture(flow: { nodes: FlowNode[]; edges: FlowEdge[] } = defaultFlow()) {
	const fixture = await testFixture();
	const setup = await fixture.createExecution();
	const saved = await fixture.run((tx) =>
		saveFlow(fixture.ctx, tx, {
			flow: setup.input.flow,
			nodes: flow.nodes,
			edges: flow.edges,
		}),
	);
	setup.input.expectedVersion = saved.flow.version;
	const execution = await setup.create();
	const home = await mkdtemp(join(tmpdir(), "trellis-langflow-native-lifecycle-"));
	const processDirectory = join(home, "native-processes");
	const clock = { at: new Date("2026-09-29T10:00:00.000Z") };
	fixture.ctx.now = clock.at;
	let processes = await DeterministicProcessHost.create(processDirectory, () => clock.at.toISOString());
	const processHosts = [processes];
	const prepare = spyOn(HarnessHost.prototype, "prepare").mockImplementation(async (input) => ({
		fingerprint: JSON.stringify([input.harness, input.model, input.effort, null]),
		prompt: input.prompt,
		spec: { id: input.id, command: "fixture-agent", args: [], cwd: home, env: {}, mode: "pty" },
		harness: input.harness,
	}));
	const start = spyOn(HarnessHost.prototype, "start").mockImplementation(async (input) => processes.launch(input));
	const ctx = {
		core: fixture.ctx,
		actor: fixture.ctx.actor!,
		session: null,
		home,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: "boot-native-lifecycle",
		localUrl: "http://localhost:4597",
		publicUrl: "http://localhost:4597",
		ghStatus: () => ({ ok: true, user: "fixture", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		afterCommit: () => {},
		background: () => {},
		vacuum: async () => {},
		now: () => clock.at,
		newTx: fixture.run,
		emit: () => {},
	} as FlowCtx;
	const launch = (claim: Claim) =>
		startNative(ctx, claim, {
			workspace: async () => home,
			runtime: async () => processes.client() as never,
			guide: async () => "Run the deterministic native lifecycle fixture.",
			env: {},
		});
	const observe = (_ctx: FlowCtx, run: LaunchRun): Promise<HarnessSnapshot | null> =>
		readNativeHarness(ctx, run, processes.client() as never);
	const stop = async (_ctx: FlowCtx, run: LaunchRun) => {
		if (run.terminalId === null) return;
		await processes.stop(run.terminalId);
		await refreshNative(
			ctx,
			run,
			(attemptId) => processes.inspect(attemptId),
			async () => "fixture output",
		);
	};
	const warnings: { id: string; text: string; messageId: string }[] = [];
	const reconcile = () =>
		prepareFlowReconcile(
			ctx,
			{},
			{
				closeExited: async () => [],
				start: (_ctx, claim) => launch(claim),
				observe,
				stop,
				warn: async (_ctx, input) => {
					warnings.push(input);
				},
			},
		);
	const read = () => fixture.run((tx) => readExecution(tx, execution.id));
	const tasks = () =>
		fixture.db.execute(
			sql`SELECT key,run_id,attempt_id,result_id FROM flow_execution_tasks WHERE execution_id=${execution.id} ORDER BY key`,
		);
	const claim = () => fixture.run((tx) => claimNext(fixture.ctx, tx, { id: execution.id }));
	const record = async (claim: Claim, snapshot: HarnessSnapshot) => {
		const attempt = await observeAttempt(
			{ newTx: fixture.run },
			{ runId: claim.run.id, attemptId: claim.attempt.id, sessionId: snapshot.sessionId },
		);
		return fixture.run((tx) =>
			recordTaskObservation(fixture.ctx, tx, {
				id: execution.id,
				key: claim.key,
				attemptId: claim.attempt.id,
				attempt,
				snapshot,
			}),
		);
	};
	return {
		...fixture,
		ctx,
		execution,
		get processes() {
			return processes;
		},
		warnings,
		clock,
		claim,
		launch,
		recordLaunch: (claim: Claim, launchedAt = clock.at.toISOString()) =>
			fixture.run((tx) =>
				recordTaskLaunch(fixture.ctx, tx, {
					id: execution.id,
					key: claim.key,
					attemptId: claim.attempt.id,
					launchedAt: Date.parse(launchedAt),
				}),
			),
		reconcile,
		read,
		tasks,
		record,
		cancel: async () => {
			const current = await read();
			return fixture.run((tx) =>
				cancel({ ...fixture.ctx, actor: { kind: "human", name: "fixture" } }, tx, {
					id: execution.id,
					expectedRevision: current.revision,
				}),
			);
		},
		decide: async (key: string, approved: boolean) => {
			const current = await read();
			return fixture.run((tx) =>
				decide({ ...fixture.ctx, actor: { kind: "human", name: "fixture" } }, tx, {
					id: execution.id,
					key,
					approved,
					output: approved ? "Approved" : "Rejected",
					expectedRevision: current.revision,
				}),
			);
		},
		drainStops: (stopProcess = stop) => drainFlowStops(ctx, execution.id, stopProcess),
		run: (id: string) => fixture.run((tx) => getRun(tx, id)),
		restartProcessHost: () => {
			processes = DeterministicProcessHost.open(processDirectory, () => clock.at.toISOString());
			processHosts.push(processes);
			return processes;
		},
		setNow: (at: string) => {
			clock.at = new Date(at);
			fixture.ctx.now = clock.at;
		},
		close: async () => {
			prepare.mockRestore();
			start.mockRestore();
			const records = await processes.records();
			const closed = [];
			for (const processHost of processHosts) closed.push(await processHost.close());
			await rm(home, { recursive: true, force: true });
			await fixture.db.$client.close();
			return {
				pids: records.flatMap((record) => record.pid ?? []),
				survivingPids: closed.flatMap((result) => result.survivingPids),
				directoryRemoved: !existsSync(home),
			};
		},
	};
}
