import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim, recover } from "../../../../../src/services/controller/controller.ts";
import { cancel } from "../../../../../src/services/controller/nextActions/cancel.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticketId: string;
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
		projectId = await seedRoot(tx, "NXT", {
			manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", directory: "/tmp/trellis-test", concurrency: 1 },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
			VALUES ('builder','Builder','builder','Build',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'NXT','native','attempt','session',${NOW},${NOW}),
			('busy','Builder','Builder','builder','Build',${projectId},'NXT','native','busy-attempt','busy-session',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('original',${projectId},1,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
	});
	await h.rebuild();
});
const queue = () =>
	h.run(
		(ctx, tx) =>
			handle(ctx, tx, {
				id: "original",
				generation: 1,
				outcomes: [{ ticketId, status: "queued", reason: "Start Builder when capacity opens." }],
			}),
		{ actor: { kind: "agent", name: "manager" } },
	);
const gather = (n: number) => h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(n) });
const take = (n: number) => h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(n) });

test("a capacity wait survives recovery and produces one assignment after capacity opens", async () => {
	expect((await queue()).workState).toBe("handled");
	expect(await h.rows(sql`SELECT * FROM manager_next_actions WHERE state='waiting'`)).toHaveLength(1);
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	await gather(1);
	expect(await take(1)).toBeNull();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(2);
	const delivery = (await take(2))!;
	expect(delivery.nextActions).toHaveLength(1);
	const action = delivery.nextActions[0]!;
	expect(action.ticketId).toBe(ticketId);
	const input = { personaId: "builder", ticket: ticketId, requestId: action.assignmentRequestId };
	const first = await h.run((ctx, tx) => reserve(ctx, tx, input), { actor: { kind: "agent", name: "manager" } });
	const again = await h.run((ctx, tx) => reserve(ctx, tx, input), { actor: { kind: "agent", name: "manager" } });
	expect(again.run.id).toBe(first.run.id);
	expect(again.replay).toBe(true);
	expect(await h.one(sql`SELECT state,run_id FROM manager_next_actions`)).toMatchObject({
		state: "assigned",
		run_id: first.run.id,
	});
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: delivery.id,
			generation: delivery.generation,
			outcomes: [{ ticketId, status: "assigned", reason: "Builder owns the work.", reference: first.run.id }],
		}),
	);
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticketId}`)).toHaveLength(1);
});

test("a repeated queued outcome keeps one action and its assignment identifier", async () => {
	await queue();
	const first = await h.one(sql`SELECT * FROM manager_next_actions`);
	await queue();
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('second',${projectId},2,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: "second",
			generation: 2,
			outcomes: [{ ticketId, status: "queued", reason: "Still at capacity." }],
		}),
	);
	expect(await h.rows(sql`SELECT id,assignment_request_id FROM manager_next_actions`)).toEqual([
		{ id: first.id, assignment_request_id: first.assignment_request_id },
	]);
});

test("a replacement manager replays the saved assignment without another worker", async () => {
	await queue();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(1);
	const action = (await take(1))!.nextActions[0]!;
	const input = { personaId: "builder", ticket: ticketId, requestId: action.assignmentRequestId };
	const first = await h.run((ctx, tx) => reserve(ctx, tx, input), { actor: { kind: "agent", name: "manager" } });
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='manager'`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,created_at,updated_at)
		VALUES ('replacement','Manager','Manager','manager','Manage',${projectId},'NXT',${NOW},${NOW})`);
	const replay = await h.run((ctx, tx) => reserve(ctx, tx, input), { actor: { kind: "agent", name: "replacement" } });
	expect(replay.replay).toBe(true);
	expect(replay.run.id).toBe(first.run.id);
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, input), { actor: { kind: "agent", name: "manager" } }),
	).rejects.toThrow();
});

for (const mode of ["project", "global", "archive"] as const) {
	test(`${mode} pause preserves a capacity wait and blocks an already delivered assignment`, async () => {
		await queue();
		await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
		await gather(1);
		const action = (await take(1))!.nextActions[0]!;
		if (mode === "project")
			await h.rows(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb`);
		if (mode === "global")
			await h.rows(sql`INSERT INTO settings(key,value,updated_at) VALUES ('nativeWorkPaused','true'::jsonb,${NOW})`);
		if (mode === "archive") await h.rows(sql`UPDATE projects SET archived_at=${NOW}`);
		await gather(2);
		expect(await h.one(sql`SELECT state,eligible_at FROM manager_next_actions`)).toMatchObject({
			state: "waiting",
			eligible_at: null,
		});
		await expect(
			h.run((ctx, tx) =>
				reserve(ctx, tx, { personaId: "builder", ticket: ticketId, requestId: action.assignmentRequestId }),
			),
		).rejects.toThrow();
		await h.rows(
			sql`UPDATE projects SET archived_at=NULL,manager_config=manager_config || '{"dispatchPaused":false}'::jsonb`,
		);
		await h.rows(sql`DELETE FROM settings WHERE key='nativeWorkPaused'`);
		await h.rebuild();
		await gather(3);
		expect((await h.one(sql`SELECT eligible_at FROM manager_next_actions`)).eligible_at).not.toBeNull();
	});
}

test("cancel prevents an old action from starting work", async () => {
	await queue();
	const action = await h.one<{ id: string; assignment_request_id: string }>(sql`SELECT * FROM manager_next_actions`);
	await expect(
		h.run((ctx, tx) => cancel(ctx, tx, { id: action.id }), { actor: { kind: "agent", name: "busy" } }),
	).rejects.toThrow();
	await h.run((ctx, tx) => cancel(ctx, tx, { id: action.id }));
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(1);
	expect(await take(1)).toBeNull();
	await expect(
		h.run((ctx, tx) =>
			reserve(ctx, tx, { personaId: "builder", ticket: ticketId, requestId: action.assignment_request_id }),
		),
	).rejects.toThrow();
});

test("an assignment from a newer ticket event retires the original capacity wait", async () => {
	await queue();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	const first = await h.run(
		(ctx, tx) => reserve(ctx, tx, { personaId: "builder", ticket: ticketId, requestId: "new-event" }),
		{ actor: { kind: "agent", name: "manager" } },
	);
	const action = await h.one(sql`SELECT state,run_id FROM manager_next_actions`);
	expect(action).toMatchObject({ state: "assigned", run_id: first.run.id });
});

test("a delayed queued outcome cannot restore a canceled action", async () => {
	await queue();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(1);
	const delivery = (await take(1))!;
	await h.run((ctx, tx) => cancel(ctx, tx, { id: delivery.nextActions[0]!.id }));
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: delivery.id,
			generation: delivery.generation,
			outcomes: [{ ticketId, status: "queued", reason: "Still waiting." }],
		}),
	);
	expect(await h.rows(sql`SELECT id FROM manager_next_actions WHERE state='waiting'`)).toEqual([]);
});

test("completed tickets retire their waits and deleted tickets remove them", async () => {
	await queue();
	await h.rows(sql`UPDATE tickets SET completed_at=${NOW} WHERE id=${ticketId}`);
	await gather(1);
	expect((await h.one(sql`SELECT state FROM manager_next_actions`)).state).toBe("canceled");
	await h.rows(sql`DELETE FROM tickets WHERE id=${ticketId}`);
	expect(await h.rows(sql`SELECT * FROM manager_next_actions`)).toEqual([]);
});

test("two eligible tickets compete for one slot without losing the second action", async () => {
	await queue();
	const otherId = await h.read(async (tx) => {
		const [row] = (await tx.execute(sql`SELECT status_id FROM tickets WHERE id=${ticketId}`)).rows;
		return seedTicket(tx, { projectId, rootId: projectId, statusId: row!.status_id as string });
	});
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('second',${projectId},2,'sent',${JSON.stringify([{ ticketId: otherId }])}::jsonb,${NOW},${NOW},${NOW})`);
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: "second",
			generation: 2,
			outcomes: [{ ticketId: otherId, status: "queued", reason: "Wait for capacity." }],
		}),
	);
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(1);
	const actions = (await take(1))!.nextActions;
	expect(actions).toHaveLength(2);
	const starts = await Promise.allSettled(
		actions.map((action) =>
			h.run((ctx, tx) =>
				reserve(ctx, tx, { personaId: "builder", ticket: action.ticketId, requestId: action.assignmentRequestId }),
			),
		),
	);
	expect(starts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(await h.rows(sql`SELECT id FROM manager_next_actions WHERE state='waiting'`)).toHaveLength(1);
	expect(await h.rows(sql`SELECT id FROM manager_next_actions WHERE state='assigned'`)).toHaveLength(1);
});

test("a bad queued ticket rolls back every outcome and action in its dispatch", async () => {
	await h.rows(
		sql`UPDATE manager_dispatches SET events=${JSON.stringify([{ ticketId }, { ticketId: "missing" }])}::jsonb`,
	);
	await expect(
		h.run((ctx, tx) =>
			handle(ctx, tx, {
				id: "original",
				generation: 1,
				outcomes: [ticketId, "missing"].map((id) => ({ ticketId: id, status: "queued", reason: "Wait." })),
			}),
		),
	).rejects.toThrow();
	expect(await h.rows(sql`SELECT * FROM manager_next_actions`)).toEqual([]);
	expect((await h.one(sql`SELECT outcomes FROM manager_dispatches`)).outcomes).toEqual([]);
});

test("a new status decision replaces the old wait without repeated immediate wakes", async () => {
	await queue();
	const statusId = await h.read((tx) =>
		seedStatus(tx, { projectId, name: "Review", category: "review", reviewer: "agent", position: 1 }),
	);
	await h.rows(sql`UPDATE tickets SET status_id=${statusId} WHERE id=${ticketId}`);
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('review',${projectId},2,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: "review",
			generation: 2,
			outcomes: [{ ticketId, status: "queued", reason: "Assign the reviewer." }],
		}),
	);
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='busy'`);
	await gather(1);
	const delivery = await take(1);
	expect(delivery?.nextActions[0]?.reason).toBe("Assign the reviewer.");
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: delivery!.id,
			generation: delivery!.generation,
			outcomes: [{ ticketId, status: "queued", reason: "Keep this action queued." }],
		}),
	);
	await gather(2);
	expect(await take(2)).toBeNull();
});

test("an idle worker releases capacity without closing its assignment", async () => {
	await queue();
	const observed = [...sessions, controllerSession("busy-attempt")];
	await h.run((ctx, tx) => collect(ctx, tx, { sessions: observed }), { now: secondsAfter(1) });
	const delivery = await h.run((ctx, tx) => claim(ctx, tx, { sessions: observed }), { now: secondsAfter(1) });
	expect(delivery?.nextActions.map((action) => action.ticketId)).toEqual([ticketId]);
	expect(await h.one<{ closed_at: string | null }>(sql`SELECT closed_at FROM agent_runs WHERE id='busy'`)).toEqual({
		closed_at: null,
	});
});

test("a start uses an idle worker's free slot and reserves it before launch", async () => {
	const observed = [controllerSession("busy-attempt")];
	const input = { ticket: ticketId, personaId: "builder" };
	const first = await h.run((ctx, tx) => reserve(ctx, tx, input, [], { sessions: observed }));
	expect(first.replay).toBe(false);
	const { capacityAvailable } = await import("../../../../../src/services/assignments/capacity.ts");
	expect(await h.read((tx) => capacityAvailable(tx, { projectId, sessions: observed }))).toBe(false);
	await expect(h.run((ctx, tx) => reserve(ctx, tx, input, [], { sessions: observed }))).rejects.toThrow();
});
