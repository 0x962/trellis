import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type RestartPlan, readRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { prepareResumeRestart } from "../../../../../src/services/restartAgents/restartAgents.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let plan: RestartPlan;
let processes: RuntimeProcessStatus[];
let launches: Parameters<NonNullable<Parameters<typeof prepareResumeRestart>[2]>["start"]>[1][];
let loseReply: boolean;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true, force: true });
});
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp("/tmp/trellis-restart-service-");
	const runId = ulid();
	const previousAttemptId = randomUUID();
	plan = {
		version: 1,
		id: randomUUID(),
		sourceReleaseId: "old",
		targetReleaseId: "new",
		createdAt: new Date().toISOString(),
		sessions: [
			{
				runId,
				previousAttemptId,
				providerSessionId: "provider-session",
				harness: "claude",
				model: "saved-model",
				workspace: "/tmp/saved-workspace",
				processIdentity: "identity",
				attempt: { id: randomUUID(), token: "next-token" },
			},
		],
	};
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "RST");
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"directory":"/tmp/source","trustedDirectory":true}'::jsonb WHERE id=${project}`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES (${runId},'Worker','native','Builder','builder','Frozen instruction',${project},'RST',${previousAttemptId},'provider-session','/tmp/saved-workspace',now(),now())`,
		);
	});
	await writeRestartPlan(home, plan);
	processes = [
		{ id: previousAttemptId, status: "exited", agent: { sessionId: "provider-session" } } as RuntimeProcessStatus,
	];
	launches = [];
	loseReply = false;
});
const ctx = () =>
	({
		...h.ctx(() => {}),
		core: h.ctx(() => {}),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	}) as unknown as Parameters<typeof prepareResumeRestart>[0];
const deps = () => ({
	host: () => ({
		list: async () => processes,
		status: async (id: string) => processes.find((p) => p.id === id)!,
		waitFor: async (id: string) => processes.find((p) => p.id === id)!,
		startPrepared: async () => {
			throw new Error("unexpected prepared launch");
		},
	}),
	start: async (_ctx: unknown, input: (typeof launches)[number]) => {
		launches.push(input);
		processes.push({
			id: input.attempt.id,
			status: "running",
			controllable: true,
			agent: { sessionId: "provider-session" },
			acknowledgedMessageIds: [input.attempt.id],
		} as RuntimeProcessStatus);
		if (loseReply) throw new Error("response lost");
		return { id: input.run.id };
	},
});
test("restart retains the assignment, workspace, provider, model, and frozen instruction", async () => {
	expect(await prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).toEqual({ resumed: 1, skipped: 0 });
	expect(launches).toHaveLength(1);
	expect(launches[0]).toMatchObject({
		run: { id: plan.sessions[0]!.runId, workspaceId: "/tmp/saved-workspace", instruction: "Frozen instruction" },
		config: { harness: { preset: "claude", model: "saved-model" } },
		resume: true,
		previousAttemptId: plan.sessions[0]!.previousAttemptId,
		resumePrompt: expect.stringContaining("Trellis performed a system restart."),
	});
	expect(await readRestartPlan(home)).toBeNull();
	expect(await h.rows(sql`SELECT * FROM agent_execution_attempts`)).toHaveLength(1);
});
test("a lost response resumes recovery without another process or attempt", async () => {
	loseReply = true;
	await expect(prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).rejects.toThrow("response lost");
	expect(await readRestartPlan(home)).not.toBeNull();
	loseReply = false;
	expect(await prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).toEqual({ resumed: 1, skipped: 0 });
	expect(launches).toHaveLength(1);
	expect(await h.rows(sql`SELECT * FROM agent_execution_attempts`)).toHaveLength(1);
});
test("manual stops and replaced assignments stay stopped", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=now()`);
	expect(await prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).toEqual({ resumed: 0, skipped: 1 });
	expect(launches).toHaveLength(0);
});
test("an unresolved old process preserves the plan and cannot start a replacement", async () => {
	processes[0]!.status = "unknown";
	await expect(prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).rejects.toThrow("stopped");
	expect(await readRestartPlan(home)).not.toBeNull();
	expect(launches).toHaveLength(0);
});
test("concurrent recovery calls share one launch and reject an agent or another restart", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const dependency = deps();
	const start = dependency.start;
	dependency.start = async (...args) => {
		await gate;
		return start(...args);
	};
	const first = prepareResumeRestart(ctx(), { restartId: plan.id }, dependency);
	const second = prepareResumeRestart(ctx(), { restartId: plan.id }, dependency);
	expect(first).toBe(second);
	await expect(
		prepareResumeRestart({ ...ctx(), actor: { kind: "agent", name: "Worker" } }, { restartId: plan.id }, dependency),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(prepareResumeRestart(ctx(), { restartId: "other" }, dependency)).rejects.toThrow("match");
	release();
	await first;
	expect(launches).toHaveLength(1);
});
test("an acknowledged process with an execution error preserves the plan", async () => {
	const dependency = deps();
	const start = dependency.start;
	dependency.start = async (...args) => {
		const result = await start(...args);
		processes[1]!.error = "process ownership lost";
		processes[1]!.status = "unknown";
		return result;
	};
	await expect(prepareResumeRestart(ctx(), { restartId: plan.id }, dependency)).rejects.toThrow(
		"process ownership lost",
	);
	expect(await readRestartPlan(home)).not.toBeNull();
});
test("a prelaunch failure keeps the assignment and plan available for repair", async () => {
	const dependency = deps();
	const broken = {
		...dependency,
		start: (context: Parameters<typeof startNative>[0], input: Parameters<typeof startNative>[1]) =>
			startNative(context, input, {
				env: {},
				workspace: async () => {
					throw new Error("Workspace temporarily unavailable");
				},
			}),
	};
	await expect(prepareResumeRestart(ctx(), { restartId: plan.id }, broken)).rejects.toThrow("did not start");
	const [run] = await h.rows(sql`SELECT closed_at,error,terminal_id FROM agent_runs`);
	expect(run!.closed_at).toBeNull();
	expect(run!.error).toContain("Workspace temporarily unavailable");
	expect(await readRestartPlan(home)).not.toBeNull();
	expect(await prepareResumeRestart(ctx(), { restartId: plan.id }, dependency)).toEqual({ resumed: 1, skipped: 0 });
	expect(await h.rows(sql`SELECT * FROM agent_execution_attempts`)).toHaveLength(1);
});
async function seedFlow(deadlineAt = Date.now() + 60000) {
	const session = plan.sessions[0]!;
	const executionId = ulid();
	const state = {
		version: 1,
		flowId: ulid(),
		flowVersion: 1,
		status: "running",
		startedAt: Date.now(),
		updatedAt: Date.now(),
		error: null,
		steps: [
			{
				key: "group",
				nodeId: "group",
				parentKey: null,
				iteration: 0,
				round: 0,
				state: "running",
				phase: "children",
				output: null,
				decision: null,
				error: null,
				startedAt: Date.now(),
				deadlineAt,
				needsStop: false,
			},
			{
				key: "worker",
				nodeId: "worker",
				parentKey: "group",
				iteration: 0,
				round: 0,
				state: "running",
				phase: "step",
				output: null,
				decision: null,
				error: null,
				startedAt: Date.now(),
				deadlineAt: null,
				needsStop: false,
			},
		],
	};
	const project = (await h.rows(sql`SELECT project_id FROM agent_runs`))[0]!.project_id;
	await h.read(async (tx) => {
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		const ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		await tx.execute(sql`UPDATE agent_runs SET ticket_id=${ticket} WHERE id=${session.runId}`);
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES (${session.previousAttemptId},${session.runId},1,'old',now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,default_persona_id,actor_kind,actor_name,request_id,request,doc,personas,state,revision,created_at,updated_at) VALUES (${executionId},${state.flowId},${ticket},${project},'persona','human','dana',${randomUUID()},'{}','{}','{}',${JSON.stringify(state)}::jsonb,1,now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,created_at) VALUES (${executionId},'worker:step:0',${session.runId},${session.previousAttemptId},now())`,
		);
	});
	return { executionId, state, deadlineAt };
}
test("a flow resume maps the attempt atomically and preserves its state and absolute deadline", async () => {
	const flow = await seedFlow();
	const dependency = deps();
	const start = dependency.start;
	dependency.start = async (...args) => {
		const [mapped] = await h.rows(
			sql`SELECT r.terminal_id,t.attempt_id FROM agent_runs r JOIN flow_execution_tasks t ON t.run_id=r.id`,
		);
		expect(mapped!.terminal_id).toBe(plan.sessions[0]!.attempt.id);
		expect(mapped!.attempt_id).toBe(mapped!.terminal_id);
		expect(args[1].deadlineAt).toBe(flow.deadlineAt);
		return start(...args);
	};
	await prepareResumeRestart(ctx(), { restartId: plan.id }, dependency);
	expect((await h.rows(sql`SELECT state FROM flow_executions WHERE id=${flow.executionId}`))[0]!.state).toEqual(
		flow.state,
	);
});
test.each(["canceled", "succeeded", "deadline"])("a %s flow cannot resume", async (reason) => {
	const flow = await seedFlow(reason === "deadline" ? Date.now() - 1000 : undefined);
	if (reason !== "deadline")
		await h.rows(
			sql`UPDATE flow_executions SET state=jsonb_set(state,'{status}',${JSON.stringify(reason)}::jsonb) WHERE id=${flow.executionId}`,
		);
	expect(await prepareResumeRestart(ctx(), { restartId: plan.id }, deps())).toEqual({ resumed: 0, skipped: 1 });
	expect(launches).toHaveLength(0);
	expect((await h.rows(sql`SELECT attempt_id FROM flow_execution_tasks`))[0]!.attempt_id).toBe(
		plan.sessions[0]!.previousAttemptId,
	);
});
