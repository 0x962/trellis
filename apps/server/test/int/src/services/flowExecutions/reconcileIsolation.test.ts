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
test("a failed runtime observation does not block another ticket's flow", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const first = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { prepareFlowReconcile } = await import("../../../../../src/services/flowExecutions/prepareFlowReconcile.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	const claim = (await h.run((ctx, tx) => claimNext(ctx, tx, { id: first.id })))!;
	const original = await h.one(sql`SELECT status_id FROM tickets WHERE id=${ticket}`);
	const secondTicket = await h.read((tx) =>
		seedTicket(tx, { projectId: project, rootId: project, statusId: original.status_id as string }),
	);
	const second = await h.run((ctx, tx) => start(ctx, tx, { ...input(), ticket: secondTicket }));
	const launched: string[] = [];
	const core = h.ctx((event) => h.flushed.push(event));
	const ctx = {
		...core,
		core,
		now: () => core.now,
		newTx: h.read,
		home: `/tmp/flow-isolation-${first.id}`,
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof prepareFlowReconcile>[0];
	const result = await prepareFlowReconcile(
		ctx,
		{},
		{
			start: async (_ctx, next) => {
				launched.push(next.id);
			},
			observe: async () => {
				throw new Error("Runtime inspection timed out");
			},
			stop: async () => {},
		},
	);
	expect(result.errors).toContain("Runtime inspection timed out");
	expect(launched).toEqual([second.id]);
	const blocked = await h.run((ctx, tx) => get(ctx, tx, { id: first.id }));
	expect(blocked.state.status).toBe("waiting");
	expect(blocked.state.steps[0]).toMatchObject({ state: "unknown", error: "Runtime inspection timed out" });
	expect(
		await h.one(sql`SELECT result_id FROM flow_execution_tasks WHERE attempt_id=${claim.attempt.id}`),
	).toMatchObject({ result_id: null });
	expect(await h.one(sql`SELECT completed_at FROM tickets WHERE id=${ticket}`)).toMatchObject({ completed_at: null });
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: second.id }))).state.status).toBe("running");
});

test("an idle process without its final result cannot succeed or complete its ticket", async () => {
	await h.rows(sql`UPDATE flow_nodes SET kind='agent' WHERE flow_id=${flow}`);
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	const { claimNext } = await import("../../../../../src/services/flowExecutions/claimNext.ts");
	const { recordTaskObservation } = await import("../../../../../src/services/flowExecutions/recordTaskObservation.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	const claim = (await h.run((ctx, tx) => claimNext(ctx, tx, { id: execution.id })))!;
	await h.run((ctx, tx) =>
		recordTaskObservation(ctx, tx, {
			id: execution.id,
			key: claim.key,
			attemptId: claim.attempt.id,
			snapshot: {
				state: "idle",
				sessionId: claim.run.sessionId,
				result: null,
				resultId: null,
				acknowledgedMessageIds: [claim.attempt.id],
				error: null,
			},
		}),
	);
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).state.steps[0]?.state).toBe("unknown");
	expect(await h.one(sql`SELECT completed_at FROM tickets WHERE id=${ticket}`)).toMatchObject({ completed_at: null });
	expect(
		await h.one(sql`SELECT result_id FROM flow_execution_tasks WHERE attempt_id=${claim.attempt.id}`),
	).toMatchObject({ result_id: null });
});
