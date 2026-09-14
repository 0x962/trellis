import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { cancel } from "../../../../../src/services/flowExecutions/cancel.ts";
import { decide } from "../../../../../src/services/flowExecutions/decide.ts";
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
test("concurrent identical starts create one frozen execution", async () => {
	const request = input();
	const [a, b] = await Promise.all([
		h.run((ctx, tx) => start(ctx, tx, request)),
		h.run((ctx, tx) => start(ctx, tx, request)),
	]);
	expect(a.id).toBe(b.id);
	expect(await h.rows(sql`SELECT * FROM flow_executions`)).toHaveLength(1);
	await h.run((ctx, tx) => flows.update(ctx, tx, { flow, name: "Changed flow" }));
	const replay = await h.run((ctx, tx) => start(ctx, tx, request));
	expect(replay.doc.flow.version).toBe(2);
	expect(replay.doc.flow.name).toBe("Test flow");
	await expect(h.run((ctx, tx) => start(ctx, tx, { ...request, expectedVersion: 3 }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});
test("new starts enforce flow version, worker persona, native runtime, and pause", async () => {
	await expect(h.run((ctx, tx) => start(ctx, tx, { ...input(), expectedVersion: 1 }))).rejects.toMatchObject({
		code: "FLOW_VERSION_CONFLICT",
	});
	await h.rows(sql`UPDATE personas SET kind='manager' WHERE id=${persona}`);
	await expect(h.run((ctx, tx) => start(ctx, tx, input()))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await h.rows(sql`UPDATE personas SET kind='builder' WHERE id=${persona}`);
	await h.rows(
		sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"directory":"/tmp","ade":"superset"}'::jsonb WHERE id=${project}`,
	);
	await expect(h.run((ctx, tx) => start(ctx, tx, input()))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await h.rows(
		sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"ade":"native","trustedDirectory":true}'::jsonb WHERE id=${project}`,
	);
	await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true'::jsonb,now())`);
	await expect(h.run((ctx, tx) => start(ctx, tx, input()))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});
test("only a person can answer a current human step", async () => {
	const record = await h.run((ctx, tx) => start(ctx, tx, input()));
	const step = record.state.steps[0]!;
	const key = `${step.key}:${step.phase}:${step.round}`;
	const decision = { id: record.id, key, approved: true, output: "Approved", expectedRevision: record.revision };
	await expect(
		h.run((ctx, tx) => decide(ctx, tx, decision), { actor: { kind: "agent", name: "worker" } }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const done = await h.run((ctx, tx) => decide(ctx, tx, decision));
	expect(done.state.status).toBe("succeeded");
	await expect(h.run((ctx, tx) => decide(ctx, tx, decision))).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
});
test("cancel saves terminal state before any process stop", async () => {
	const record = await h.run((ctx, tx) => start(ctx, tx, input()));
	const canceled = await h.run((ctx, tx) => cancel(ctx, tx, { id: record.id, expectedRevision: record.revision }));
	expect(canceled.state.status).toBe("canceled");
	expect(canceled.revision).toBe(record.revision + 1);
});
test("a late launch error cannot replace a person's cancellation", async () => {
	const execution = await h.run((ctx, tx) => start(ctx, tx, input()));
	await h.run((ctx, tx) => cancel(ctx, tx, { id: execution.id, expectedRevision: execution.revision }));
	const { recordFlowFailure } = await import("../../../../../src/services/flowExecutions/recordFlowFailure.ts");
	const { get } = await import("../../../../../src/services/flowExecutions/queries.ts");
	await h.run((ctx, tx) => recordFlowFailure(ctx, tx, { id: execution.id, error: "Late error" }));
	expect((await h.run((ctx, tx) => get(ctx, tx, { id: execution.id }))).state.status).toBe("canceled");
});
