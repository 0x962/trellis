import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { assertCurrentAttempt } from "../../../../../src/services/assignments/attempts.ts";
import * as personas from "../../../../../src/services/personas.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let ticket: string;
let personaId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "ASG", {
			manager_config: { ade: "native", personaId: null, concurrency: 1, directory: "/tmp" },
		});
		const statusId = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId });
	});
	await h.rebuild();
	personaId = (
		await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Builder", kind: "builder", instruction: "Build." }))
	).id;
});
const start = (requestId: string) => h.run((ctx, tx) => reserve(ctx, tx, { personaId, ticket, requestId }));

test("one request returns its reserved run again even when the project is at capacity", async () => {
	const first = await start("ASG-1:builder");
	const second = await start("ASG-1:builder");
	expect(second.run.id).toBe(first.run.id);
	expect(second.replay).toBe(true);
	expect(await h.rows(sql`SELECT id FROM agent_runs`)).toHaveLength(1);
	expect(await h.rows(sql`SELECT id FROM agent_execution_attempts`)).toHaveLength(1);
});

test("a request cannot change its persona or target", async () => {
	await start("work");
	const other = (
		await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Other", kind: "builder", instruction: "Build." }))
	).id;
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { personaId: other, ticket, requestId: "work" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const otherTicket = await h.read(async (tx) => {
		const [status] = (await tx.execute(sql`SELECT id FROM statuses`)).rows;
		return seedTicket(tx, { projectId: project, rootId: project, statusId: status!.id as string });
	});
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { personaId, ticket: otherTicket, requestId: "work" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test("distinct request IDs permit intentional parallel assignments", async () => {
	await h.rows(sql`UPDATE projects SET manager_config = manager_config || '{"concurrency":2}'::jsonb`);
	const first = await start("builder:part-one");
	const second = await start("builder:part-two");
	expect(first.run.id).not.toBe(second.run.id);
});

test("native attempts keep a durable terminal ID and store only a token hash", async () => {
	const result = await start("native");
	if (result.replay) throw new Error("Expected a new assignment");
	expect(result.attempt).toBeDefined();
	expect(result.run.terminalId).toBe(result.attempt!.id);
	const row = await h.one(sql`SELECT * FROM agent_execution_attempts`);
	expect(row.token_hash).not.toBe(result.attempt!.token);
	expect(row.generation).toBe(1);
	await h.read((tx) =>
		assertCurrentAttempt({ actor: { kind: "agent", name: result.run.id }, attemptToken: result.attempt!.token }, tx),
	);
	await expect(
		h.read((tx) => assertCurrentAttempt({ actor: { kind: "agent", name: result.run.id }, attemptToken: null }, tx)),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test("a replacement manager attempt rejects the prior generation token", async () => {
	const managerId = (
		await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Manager", kind: "manager", instruction: "Manage." }))
	).id;
	const first = await h.run((ctx, tx) => reserve(ctx, tx, { personaId: managerId, project, requestId: "manager-one" }));
	if (first.replay) throw new Error("Expected a new assignment");
	expect(first.context).not.toContain("--request-id");
	await h.rows(sql`UPDATE agent_runs SET closed_at = now() WHERE id = ${first.run.id}`);
	const second = await h.run((ctx, tx) =>
		reserve(ctx, tx, { personaId: managerId, project, requestId: "manager-two" }, [first.attempt.id]),
	);
	if (second.replay) throw new Error("Expected a new attempt");
	expect(second.run.id).toBe(first.run.id);
	expect(second.attempt!.generation).toBe(2);
	await expect(
		h.read((tx) =>
			assertCurrentAttempt({ actor: { kind: "agent", name: first.run.id }, attemptToken: first.attempt!.token }, tx),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await h.read((tx) =>
		assertCurrentAttempt({ actor: { kind: "agent", name: second.run.id }, attemptToken: second.attempt!.token }, tx),
	);
});

test("human and untracked external agent sessions do not need an attempt token", async () => {
	await h.read((tx) => assertCurrentAttempt({ actor: { kind: "human", name: "dana" }, attemptToken: null }, tx));
	await h.read((tx) =>
		assertCurrentAttempt({ actor: { kind: "agent", name: "external-session" }, attemptToken: null }, tx),
	);
});

test("historical external manager metadata does not reserve a native manager slot", async () => {
	const managerId = (
		await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Manager", kind: "manager", instruction: "Manage." }))
	).id;
	await h.rows(
		sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,created_at,updated_at) VALUES ('external','Old manager','superset','Manager','manager','Manage',${project},'ASG',now(),now())`,
	);
	const current = await h.run((ctx, tx) =>
		reserve(ctx, tx, { personaId: managerId, project, requestId: "native-manager" }),
	);
	expect(current.run.runtime).toBe("native");
	expect(current.run.id).not.toBe("external");
});
