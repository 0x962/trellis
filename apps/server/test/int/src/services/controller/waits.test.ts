import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim } from "../../../../../src/services/controller/controller.ts";
import type { WorkOutcome } from "../../../../../src/services/controller/types.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession, workingSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticketId: string;
let dependencyId: string;
let doneId: string;
const sessions = [controllerSession()];
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "WAIT", {
			manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", directory: "/tmp/trellis-test", concurrency: 1 },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		doneId = await seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 });
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		dependencyId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
			VALUES ('builder','Builder','builder','Build',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'WAIT','native','attempt','session',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('original',${projectId},1,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
	});
	await h.rebuild();
});
const wait = (waitFor: WorkOutcome["waitFor"]) =>
	h.run(
		(ctx, tx) =>
			handle(ctx, tx, {
				id: "original",
				generation: 1,
				outcomes: [{ ticketId, status: "blocked", reason: "Revisit this ticket.", waitFor }],
			}),
		{ actor: { kind: "agent", name: "manager" } },
	);
const gather = (n: number) => h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(n) });
const take = (n: number) => h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(n) });
const comment = (id: string, parent: string | null, kind = "agent") =>
	h.rows(sql`
	INSERT INTO comments (id,ticket_id,parent_id,body,actor_kind,actor_name,created_at,updated_at)
	VALUES (${id},${ticketId},${parent},'Please review this decision.',${kind},${kind === "human" ? "dana" : "claude"},${NOW},${NOW})`);

test("a timed wait wakes at its deadline, never early, and retains one assignment identity", async () => {
	const waitFor = { type: "time" as const, at: secondsAfter(10).toISOString() };
	await wait(waitFor);
	await gather(9);
	expect(await take(9)).toBeNull();
	await gather(10);
	const delivery = (await take(10))!;
	expect(delivery.nextActions[0]).toMatchObject({ ticketId, wakeCondition: "time", waitFor });
	const action = delivery.nextActions[0]!;
	const input = { personaId: "builder", ticket: ticketId, requestId: action.assignmentRequestId };
	const first = await h.run((ctx, tx) => reserve(ctx, tx, input), { now: secondsAfter(10) });
	const again = await h.run((ctx, tx) => reserve(ctx, tx, input), { now: secondsAfter(11) });
	expect(again.run.id).toBe(first.run.id);
	expect(again.replay).toBe(true);
});

test("a saved assignment identifier starts its worker before the wait deadline", async () => {
	await wait({ type: "time", at: secondsAfter(10).toISOString() });
	const action = await h.one<{ assignment_request_id: string }>(
		sql`SELECT assignment_request_id FROM manager_next_actions`,
	);
	const started = await h.run(
		(ctx, tx) => reserve(ctx, tx, { personaId: "builder", ticket: ticketId, requestId: action.assignment_request_id }),
		{ now: secondsAfter(9) },
	);
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticketId}`)).toEqual([{ id: started.run.id }]);
	expect(await h.one<{ state: string }>(sql`SELECT state FROM manager_next_actions`)).toEqual({ state: "assigned" });
});

test("a dependency wait wakes when its ticket reaches Done and rechecks a reopened dependency", async () => {
	await wait({ type: "dependency", ticketId: dependencyId });
	await gather(1);
	expect(await take(1)).toBeNull();
	const previous = await h.one<{ status_id: string }>(sql`SELECT status_id FROM tickets WHERE id=${dependencyId}`);
	await h.rows(sql`UPDATE tickets SET status_id=${doneId},completed_at=${NOW} WHERE id=${dependencyId}`);
	await gather(2);
	const delivery = (await take(2))!;
	expect(delivery.nextActions[0]).toMatchObject({ ticketId, wakeCondition: "dependency" });
	await h.rows(sql`UPDATE tickets SET status_id=${previous.status_id},completed_at=NULL WHERE id=${dependencyId}`);
	const started = await h.run((ctx, tx) =>
		reserve(ctx, tx, {
			personaId: "builder",
			ticket: ticketId,
			requestId: delivery.nextActions[0]!.assignmentRequestId,
		}),
	);
	expect(started.run.ticketId).toBe(ticketId);
	expect(await h.one<{ state: string }>(sql`SELECT state FROM manager_next_actions`)).toEqual({ state: "assigned" });
});

test("a canceled dependency does not count as successful completion", async () => {
	await wait({ type: "dependency", ticketId: dependencyId });
	const canceled = await h.read((tx) =>
		seedStatus(tx, { projectId, name: "Canceled", category: "canceled", position: 2 }),
	);
	await h.rows(sql`UPDATE tickets SET status_id=${canceled},completed_at=${NOW} WHERE id=${dependencyId}`);
	await h.rebuild();
	await gather(1);
	expect(await take(1)).toBeNull();
});

test("a human reply wakes its question without interpreting the answer or changing ticket status", async () => {
	await comment("question", null);
	await comment("other", null, "human");
	await wait({ type: "human_response", commentId: "question" });
	await comment("agent-reply", "question");
	await comment("unrelated-reply", "other", "human");
	await gather(1);
	expect(await take(1)).toBeNull();
	const before = await h.one<{ status_id: string }>(sql`SELECT status_id FROM tickets WHERE id=${ticketId}`);
	await comment("answer", "question", "human");
	await h.rows(sql`UPDATE comments SET body='No. Do not proceed.' WHERE id='answer'`);
	await gather(2);
	const delivery = (await take(2))!;
	expect(delivery.nextActions[0]).toMatchObject({ ticketId, wakeCondition: "human_response" });
	expect(await h.one<{ status_id: string }>(sql`SELECT status_id FROM tickets WHERE id=${ticketId}`)).toEqual(before);
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticketId}`)).toEqual([]);
});

test("a human reply received before the wait is recorded still wakes its question", async () => {
	await comment("question", null);
	await comment("answer", "question", "human");
	await wait({ type: "human_response", commentId: "question" });
	await gather(1);
	expect((await take(1))?.nextActions[0]?.wakeCondition).toBe("human_response");
});

test("a due wait wakes the manager at full worker capacity but cannot exceed its worker limit", async () => {
	await wait({ type: "time", at: secondsAfter(1).toISOString() });
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,created_at,updated_at)
		VALUES ('busy','Builder','Builder','builder','Build',${projectId},'WAIT','native','busy-attempt',${NOW},${NOW})`);
	const observed = [...sessions, workingSession("busy-attempt")];
	await h.run((ctx, tx) => collect(ctx, tx, { sessions: observed }), { now: secondsAfter(1) });
	const delivery = (await h.run((ctx, tx) => claim(ctx, tx, { sessions: observed }), { now: secondsAfter(1) }))!;
	expect(delivery.nextActions).toHaveLength(1);
	await expect(
		h.run(
			(ctx, tx) =>
				reserve(
					ctx,
					tx,
					{
						personaId: "builder",
						ticket: ticketId,
						requestId: delivery.nextActions[0]!.assignmentRequestId,
					},
					[],
					{ sessions: [workingSession("busy-attempt")] },
				),
			{ now: secondsAfter(1) },
		),
	).rejects.toThrow();
});

test("a pause holds a timed wait past its deadline and resume makes it eligible", async () => {
	await wait({ type: "time", at: secondsAfter(1).toISOString() });
	await h.rows(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb`);
	await gather(2);
	expect(await take(2)).toBeNull();
	await h.rows(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":false}'::jsonb`);
	await gather(3);
	expect((await take(3))?.nextActions).toHaveLength(1);
});

test("invalid dependency and question references roll back the outcome", async () => {
	for (const waitFor of [
		{ type: "dependency" as const, ticketId },
		{ type: "dependency" as const, ticketId: "missing" },
		{ type: "human_response" as const, commentId: "missing" },
	])
		await expect(wait(waitFor)).rejects.toThrow();
	expect(await h.rows(sql`SELECT * FROM manager_next_actions`)).toEqual([]);
	expect((await h.one(sql`SELECT outcomes FROM manager_dispatches`)).outcomes).toEqual([]);
});

test("a start during a timed wait assigns the waiting action and retires the wait", async () => {
	await wait({ type: "time", at: secondsAfter(10).toISOString() });
	const assigned = await h.run(
		(ctx, tx) => reserve(ctx, tx, { personaId: "builder", ticket: ticketId, requestId: "new-event" }),
		{ now: secondsAfter(9) },
	);
	expect(assigned.run.ticketId).toBe(ticketId);
	expect(await h.one(sql`SELECT state,run_id FROM manager_next_actions`)).toMatchObject({
		state: "assigned",
		run_id: assigned.run.id,
	});
	await gather(10);
	expect(await take(10)).toBeNull();
});

test("a status change supersedes an old timed wait before the next controller tick", async () => {
	await wait({ type: "time", at: secondsAfter(10).toISOString() });
	const statusId = await h.read((tx) =>
		seedStatus(tx, { projectId, name: "Review", category: "review", reviewer: "agent", position: 2 }),
	);
	await h.rows(sql`UPDATE tickets SET status_id=${statusId} WHERE id=${ticketId}`);
	await h.rebuild();
	const assigned = await h.run((ctx, tx) => reserve(ctx, tx, { personaId: "builder", ticket: ticketId }), {
		now: secondsAfter(1),
	});
	expect(assigned.run.ticketId).toBe(ticketId);
});

test("a repeated outcome cannot change its recorded wake condition", async () => {
	await wait({ type: "time", at: secondsAfter(10).toISOString() });
	await expect(wait({ type: "time", at: secondsAfter(20).toISOString() })).rejects.toThrow();
});

test("a manager can move a due wait to a later time without an immediate repeated notification", async () => {
	await wait({ type: "time", at: secondsAfter(1).toISOString() });
	await gather(1);
	const delivery = (await take(1))!;
	const old = delivery.nextActions[0]!;
	const waitFor = { type: "time" as const, at: secondsAfter(10).toISOString() };
	await h.run(
		(ctx, tx) =>
			handle(ctx, tx, {
				id: delivery.id,
				generation: delivery.generation,
				outcomes: [{ ticketId, status: "blocked", reason: "The reset moved.", waitFor }],
			}),
		{ now: secondsAfter(1) },
	);
	await gather(2);
	expect(await take(2)).toBeNull();
	await gather(10);
	const action = (await take(10))!.nextActions[0]!;
	expect(action.waitFor).toEqual(waitFor);
	expect(action.assignmentRequestId).not.toBe(old.assignmentRequestId);
	await expect(
		h.run(
			(ctx, tx) =>
				reserve(ctx, tx, {
					personaId: "builder",
					ticket: ticketId,
					requestId: old.assignmentRequestId,
				}),
			{ now: secondsAfter(10) },
		),
	).rejects.toThrow();
});

test("an unchanged wake condition does not send the same wait on every controller tick", async () => {
	const waitFor = { type: "time" as const, at: secondsAfter(1).toISOString() };
	await wait(waitFor);
	await gather(1);
	const delivery = (await take(1))!;
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: delivery.id,
			generation: delivery.generation,
			outcomes: [{ ticketId, status: "blocked", reason: "Keep this wait.", waitFor }],
		}),
	);
	await gather(2);
	expect(await take(2)).toBeNull();
});
