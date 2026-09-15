import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { start } from "../../../../../src/services/flowExecutions/start.ts";
import * as flows from "../../../../../src/services/flows/flows.ts";
import { save } from "../../../../../src/services/flows/save.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let ticket: string;
let persona: string;
let flow: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "FLW");
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		persona = ulid();
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"ade":"native","directory":"/tmp","trustedDirectory":true}'::jsonb WHERE id=${project}`,
		);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${persona},'Flow worker','builder','Frozen persona',now(),now())`,
		);
	});
	await h.rebuild();
	const created = await h.run((ctx, tx) => flows.create(ctx, tx, { name: "Test flow" }));
	flow = created.id;
	await h.run((ctx, tx) =>
		save(ctx, tx, {
			flow,
			nodes: [
				{
					id: ulid(),
					parentId: null,
					kind: "human",
					title: "Approve",
					instruction: "Approve output",
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
		}),
	);
});
const input = () => ({ flow, ticket, defaultPersonaId: persona, expectedVersion: 2, requestId: randomUUID() });
test("a claimed flow task binds one ordinary attempt across concurrent claims", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const claims = await Promise.all([
		h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })),
		h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })),
	]);
	expect(claims.filter(Boolean)).toHaveLength(1);
	expect(await h.rows(sql`SELECT * FROM flow_execution_tasks`)).toHaveLength(1);
	expect(await h.rows(sql`SELECT * FROM agent_execution_attempts`)).toHaveLength(1);
	const claimed = claims.find(Boolean)!;
	expect(claimed.run.instruction).toContain("Frozen persona");
	expect(await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id }))).toBeNull();
});
test("a task result requires its current attempt and durable first-message receipt", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='gate' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { recordTaskObservation } = await import("../../../../../src/services/flowExecutions/recordTaskObservation.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	const claim = (await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })))!;
	const snapshot = {
		state: "idle" as const,
		sessionId: claim.run.sessionId!,
		resultId: "result",
		result: "YES",
		error: null,
		acknowledgedMessageIds: [] as string[],
	};
	const record = (value = snapshot) =>
		h.run((ctx, tx) =>
			recordTaskObservation(ctx, tx, {
				id: execution.id,
				key: claim.key,
				attemptId: claim.attempt.id,
				snapshot: value,
			}),
		);
	await record();
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).state.status).toBe("waiting");
	snapshot.acknowledgedMessageIds.push(claim.attempt.id);
	await record({ ...snapshot, result: "Probably YES" });
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).state.status).toBe("waiting");
	await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id=${claim.run.id}`);
	await record();
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).state.status).toBe("waiting");
	await h.rows(sql`UPDATE agent_runs SET terminal_id=${claim.attempt.id} WHERE id=${claim.run.id}`);
	await record();
	const done = await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }));
	expect(done.state.status).toBe("succeeded");
	await record();
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).revision).toBe(done.revision);
});
test("a host restart observes a claimed attempt without another launch", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { prepareFlowReconcile } = await import("../../../../../src/services/flowExecutions/prepareFlowReconcile.ts");
	const claim = (await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })))!;
	let launches = 0;
	const core = h.ctx((event) => h.flushed.push(event));
	const ctx = {
		...core,
		core,
		now: () => core.now,
		newTx: h.read,
		home: `/tmp/flow-${execution.id}`,
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof prepareFlowReconcile>[0];
	const deps = {
		start: async () => {
			launches++;
		},
		observe: async () => ({
			state: "unknown" as const,
			sessionId: claim.run.sessionId!,
			result: null,
			error: "Runtime response unknown",
			acknowledgedMessageIds: [],
		}),
		stop: async () => {},
	};
	await prepareFlowReconcile(ctx, {}, deps);
	await prepareFlowReconcile({ ...ctx }, {}, deps);
	expect(launches).toBe(0);
	expect(await h.rows(sql`SELECT * FROM agent_execution_attempts`)).toHaveLength(1);
});
test("ordinary starts and flow claims share the project capacity lock", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{concurrency}','1') WHERE id=${project}`,
	);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { reserve } = await import("../../../../../src/services/agentRuns/reserve.ts");
	await Promise.allSettled([
		h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })),
		h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: persona, requestId: randomUUID() })),
	]);
	expect(await h.rows(sql`SELECT * FROM agent_runs WHERE closed_at IS NULL AND project_id=${project}`)).toHaveLength(1);
});
test("an expired flow deadline prevents a native launch", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { startNative } = await import("../../../../../src/services/agentRuns/nativeStart.ts");
	const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
	const { join } = await import("node:path");
	const home = mkdtempSync("/tmp/flow-expired-");
	const claim = (await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })))!;
	const core = h.ctx((event) => h.flushed.push(event));
	const ctx = {
		...core,
		core,
		now: () => core.now,
		newTx: h.read,
		home,
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof startNative>[0];
	await startNative(ctx, { ...claim, deadlineAt: Date.now() - 1 });
	const run = await h.one(sql`SELECT error FROM agent_runs WHERE id=${claim.run.id}`);
	expect(run.error).toContain("deadline");
	expect(existsSync(join(home, "runtime"))).toBe(false);
	rmSync(home, { recursive: true, force: true });
});
test("project dispatch pause prevents a new flow claim", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{dispatchPaused}','true') WHERE id=${project}`,
	);
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	expect(await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id }))).toBeNull();
	expect(await h.rows(sql`SELECT * FROM agent_runs`)).toHaveLength(0);
});
test("an unconfirmed cancellation persists its error and refuses a success response", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { prepareFlowCancel } = await import("../../../../../src/services/flowExecutions/prepareFlowCancel.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id }));
	const current = await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }));
	const core = h.ctx((event) => h.flushed.push(event));
	const ctx = {
		...core,
		core,
		now: () => core.now,
		newTx: h.read,
		home: "/tmp/unused-flow-cancel",
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof prepareFlowCancel>[0];
	await expect(
		prepareFlowCancel(ctx, { id: execution.id, expectedRevision: current.revision }, async () => {
			throw new Error("The process owner is unknown");
		}),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const canceled = await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }));
	expect(canceled.state.status).toBe("canceled");
	expect(canceled.state.steps[0]?.needsStop).toBe(true);
	expect(canceled.state.steps[0]?.error).toContain("unknown");
});
test("a changed project configuration records a visible flow failure", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{trustedDirectory}','false') WHERE id=${project}`,
	);
	const { prepareFlowReconcile } = await import("../../../../../src/services/flowExecutions/prepareFlowReconcile.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	const core = h.ctx((event) => h.flushed.push(event));
	const ctx = {
		...core,
		core,
		now: () => core.now,
		newTx: h.read,
		home: "/tmp/unused-flow-config",
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof prepareFlowReconcile>[0];
	await prepareFlowReconcile(
		ctx,
		{},
		{
			start: async () => {
				throw new Error("Must not launch");
			},
			stop: async () => {},
			observe: async () => null,
		},
	);
	const result = await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }));
	expect(result.state.status).toBe("failed");
	expect(result.state.error).toContain("trusted");
});
