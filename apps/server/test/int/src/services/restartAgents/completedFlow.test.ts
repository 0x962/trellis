import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type RestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { prepareResumeRestart } from "../../../../../src/services/restartAgents/restartAgents.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let plan: RestartPlan;
let previous: RuntimeProcessStatus;
let launches: number;
let project: string;
let ticket: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp("/tmp/trl-flow-resume-");
	const runId = ulid();
	plan = {
		version: 1,
		id: randomUUID(),
		sourceReleaseId: "old",
		targetReleaseId: "next",
		createdAt: new Date().toISOString(),
		sessions: [
			{
				runId,
				previousAttemptId: "previous",
				providerSessionId: "provider-session",
				harness: "codex",
				workspace: home,
				processIdentity: "identity",
				attempt: { id: "next", token: "next-token" },
			},
		],
	};
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "FLOW");
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"directory":"/tmp/work","trustedDirectory":true}'::jsonb WHERE id=${project}`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES (${runId},'Worker','native','Builder','builder','Task',${project},'FLOW',${ticket},'previous','provider-session',${home},now(),now())`,
		);
	});
	previous = {
		id: "previous",
		status: "exited",
		controllable: false,
		agent: {
			sessionId: "provider-session",
			model: null,
			turnId: "turn",
			tool: null,
			error: null,
			outcome: "completed",
		},
		activity: { state: "idle", updatedAt: new Date().toISOString() },
		result: { id: "original-result", text: "YES" },
		acknowledgedMessageIds: ["previous"],
		error: null,
	} as RuntimeProcessStatus;
	launches = 0;
	await writeRestartPlan(home, plan);
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true, force: true });
});
const context = () =>
	({
		...h.ctx(() => {}),
		core: h.ctx(() => {}),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	}) as unknown as Parameters<typeof prepareResumeRestart>[0];
const resume = (onStart?: (runId: string) => void) => {
	const processes = plan.sessions.map((entry) =>
		entry.previousAttemptId === previous.id
			? previous
			: {
					...previous,
					id: entry.previousAttemptId,
					acknowledgedMessageIds: [entry.previousAttemptId],
				},
	);
	return prepareResumeRestart(
		context(),
		{ restartId: plan.id },
		{
			host: () => ({
				list: async () => processes,
				status: async (id) => processes.find((item) => item.id === id)!,
				waitFor: async (id) => processes.find((item) => item.id === id)!,
				startPrepared: async () => {
					throw new Error("unexpected prepared launch");
				},
			}),
			start: async (_ctx, input) => {
				launches++;
				onStart?.(input.run.id);
				processes.push({
					...previous,
					id: input.attempt.id,
					status: "running",
					controllable: true,
					acknowledgedMessageIds: [input.attempt.id],
					result: { id: "restart-notice-result", text: "Everything is okay" },
				});
				return { id: plan.sessions[0]!.runId };
			},
		},
	);
};
const seedFlow = async (kind: "gate" | "agent" = "gate") => {
	const id = ulid();
	const flowId = ulid();
	const doc = {
		nodes: [
			{
				id: "worker",
				parentId: null,
				kind,
				title: "Worker",
				instruction: "Task",
				personaId: null,
				parallel: false,
				minutes: null,
				maxRounds: null,
				x: 0,
				y: 0,
				width: null,
				height: null,
			},
		],
		edges: [],
	};
	const state = {
		version: 1,
		flowId,
		flowVersion: 1,
		status: "running",
		startedAt: Date.now(),
		updatedAt: Date.now(),
		error: null,
		steps: [
			{
				key: "worker",
				nodeId: "worker",
				parentKey: null,
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
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES ('previous',${plan.sessions[0]!.runId},1,'old',now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,default_persona_id,actor_kind,actor_name,request_id,request,doc,personas,state,revision,created_at,updated_at) VALUES (${id},${flowId},${ticket},${project},'persona','human','dana',${randomUUID()},'{}',${JSON.stringify(doc)}::jsonb,'{}',${JSON.stringify(state)}::jsonb,1,now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,created_at) VALUES (${id},'worker:step:0',${plan.sessions[0]!.runId},'previous',now())`,
		);
	});
	return { id, state };
};

test.each(["gate", "agent"] as const)(
	"a completed %s retains its original result without a restart message",
	async (kind) => {
		const flow = await seedFlow(kind);
		if (kind === "agent") previous.result!.text = "Completed implementation and validation";
		expect(await resume()).toEqual({ resumed: 0, skipped: 1 });
		expect(launches).toBe(0);
		const [task] = await h.rows(sql`SELECT attempt_id,result_id FROM flow_execution_tasks`);
		expect(task).toEqual({ attempt_id: "previous", result_id: "original-result" });
		const [saved] = await h.rows(sql`SELECT state FROM flow_executions WHERE id=${flow.id}`);
		expect(saved!.state.status).toBe("succeeded");
		expect(saved!.state.steps[0]).toMatchObject({
			output: previous.result!.text,
			decision: kind === "gate" ? "yes" : null,
		});
	},
);
test("work interrupted by runtime shutdown still resumes", async () => {
	const flow = await seedFlow();
	previous.agent!.outcome = "interrupted";
	previous.activity!.state = "working";
	expect(await resume()).toEqual({ resumed: 1, skipped: 0 });
	expect((await h.rows(sql`SELECT state FROM flow_executions WHERE id=${flow.id}`))[0]!.state).toEqual(flow.state);
	expect((await h.rows(sql`SELECT attempt_id,result_id FROM flow_execution_tasks`))[0]).toEqual({
		attempt_id: "next",
		result_id: null,
	});
});
test("a completed non-flow agent still resumes its saved session", async () => {
	expect(await resume()).toEqual({ resumed: 1, skipped: 0 });
	expect(launches).toBe(1);
});
test("an old result without the current attempt receipt cannot complete a flow", async () => {
	const flow = await seedFlow();
	previous.acknowledgedMessageIds = [];
	expect(await resume()).toEqual({ resumed: 1, skipped: 0 });
	expect((await h.rows(sql`SELECT state FROM flow_executions WHERE id=${flow.id}`))[0]!.state).toEqual(flow.state);
	expect((await h.rows(sql`SELECT result_id FROM flow_execution_tasks`))[0]!.result_id).toBeNull();
});
test("manual stop remains authoritative when a completed result exists", async () => {
	const flow = await seedFlow();
	await h.rows(sql`UPDATE agent_runs SET closed_at=now()`);
	expect(await resume()).toEqual({ resumed: 0, skipped: 1 });
	expect(launches).toBe(0);
	expect((await h.rows(sql`SELECT state FROM flow_executions WHERE id=${flow.id}`))[0]!.state).toEqual(flow.state);
});

test("workers resume before a manager captured first", async () => {
	const manager = plan.sessions[0]!;
	const worker = {
		...manager,
		runId: ulid(),
		previousAttemptId: "worker-previous",
		attempt: { id: "worker-next", token: "worker-token" },
	};
	await h.rows(sql`UPDATE agent_runs SET kind='manager',ticket_id=NULL WHERE id=${manager.runId}`);
	await h.rows(
		sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES (${worker.runId},'Second','native','Builder','builder','Task',${project},'FLOW',${ticket},${worker.previousAttemptId},'provider-session',${home},now(),now())`,
	);
	plan.sessions.push(worker);
	await writeRestartPlan(home, plan);
	const order: string[] = [];
	expect(await resume((id) => order.push(id))).toEqual({ resumed: 2, skipped: 0 });
	expect(order).toEqual([worker.runId, manager.runId]);
});
