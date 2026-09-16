import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { list as listRuns } from "../../../../../src/services/agentRuns/agentRuns.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { capacityAvailable } from "../../../../../src/services/assignments/capacity.ts";
import { agentContext } from "../../../../../src/services/controller/agentContext/agentContext.ts";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim } from "../../../../../src/services/controller/controller.ts";
import { coordination } from "../../../../../src/services/controller/coordination.ts";
import { refresh } from "../../../../../src/services/controller/nextActions/queries.ts";
import { reserveSubmanager } from "../../../../../src/services/submanagers/reserveSubmanager.ts";
import { resize } from "../../../../../src/services/submanagers/resize.ts";
import { release } from "../../../../../src/services/submanagers/retire.ts";
import { seedActors, seedChild, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let root: string;
let child: string;
let leaf: string;
let ticket: string;
let otherTicket: string;
const parent = { actor: { kind: "agent" as const, name: "manager" } };
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES
		('01ARZ3NDEKTSV4RRFFQ69G5FAV','Manager','manager','Manage',${NOW},${NOW}),('builder','Builder','builder','Build',${NOW},${NOW})`);
		root = await seedRoot(tx, "SUB", {
			manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", concurrency: 4, directory: "/tmp" },
		});
		child = await seedChild(tx, root, root, "child");
		leaf = await seedChild(tx, child, root, "leaf");
		const statusId = await seedStatus(tx, {
			projectId: root,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: child, rootId: root, statusId });
		otherTicket = await seedTicket(tx, { projectId: leaf, rootId: root, statusId });
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
		VALUES ('manager','Manager','01ARZ3NDEKTSV4RRFFQ69G5FAV','Manager','manager','Manage',${root},'SUB','native','attempt','session',${NOW},${NOW})`);
	});
	await h.rebuild();
});
const delegate = (capacity = 1) =>
	h.run(
		(ctx, tx) =>
			reserveSubmanager(ctx, tx, {
				project: child,
				capacity,
				brief: "Finish the child projects.",
				requestId: "delegate-child",
			}),
		parent,
	);

test("a submanager receives its subtree events without a configured manager or parent forwarding", async () => {
	const result = await delegate();
	expect(result.replay).toBe(false);
	await h.rows(sql`UPDATE agent_runs SET session_id='child-session' WHERE id=${result.run.id}`);
	await h.rows(sql`INSERT INTO activity (batch_id,project_id,root_id,ticket_id,actor_name,actor_kind,action,created_at)
	VALUES ('test',${leaf},${root},${otherTicket},'dana','human','created',${NOW})`);
	const sessions = [controllerSession(result.run.terminalId!)];
	await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(11) });
	const delivery = await h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(11) });
	expect(delivery?.runId).toBe(result.run.id);
	expect(delivery?.events.map((event) => event.ticketId)).toEqual([otherTicket]);
	expect(await h.rows(sql`SELECT id FROM manager_dispatches WHERE project_id=${root}`)).toHaveLength(0);
});

test("the dedicated capacity covers workers across the whole delegated subtree", async () => {
	const { run } = await delegate();
	await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder" }), {
		actor: { kind: "agent", name: run.id },
	});
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: leaf }))).toBe(false);
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { ticket: otherTicket, personaId: "builder" }), {
			actor: { kind: "agent", name: run.id },
		}),
	).rejects.toThrow();
	await h.run((ctx, tx) => resize(ctx, tx, { id: run.id, capacity: 2 }), parent);
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: leaf }))).toBe(true);
});

test("a repeated start preserves one submanager and rejects a changed request", async () => {
	const first = await delegate();
	expect((await delegate()).run.id).toBe(first.run.id);
	await expect(delegate(2)).rejects.toThrow();
	expect(await h.rows(sql`SELECT * FROM manager_delegations`)).toHaveLength(1);
});

test("a parent cannot assign a worker inside the delegated subtree", async () => {
	await delegate();
	await expect(h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder" }), parent)).rejects.toThrow();
});

test("a manager cannot delegate its own project or another root", async () => {
	for (const project of [root, await h.read((tx) => seedRoot(tx, "OTHER"))]) {
		await h.rebuild();
		await expect(
			h.run(
				(ctx, tx) => reserveSubmanager(ctx, tx, { project, capacity: 1, brief: "Own this work.", requestId: project }),
				parent,
			),
		).rejects.toThrow();
	}
});

test("an idle submanager gets its own heartbeat and appears in its parent's runtime context", async () => {
	const { run } = await delegate();
	const sessions = [controllerSession(run.terminalId!)];
	await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(61) });
	const heartbeat = await h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(61) });
	expect(heartbeat?.runId).toBe(run.id);
	expect(heartbeat?.events).toEqual([]);
	const context = await h.run((ctx, tx) => agentContext(ctx, tx, { sessions, projectId: root, runId: "manager" }));
	expect(context.agents.map((agent) => agent.runId)).toContain(run.id);
	expect((await h.run((ctx, tx) => listRuns(ctx, tx, {}))).map((item) => item.id)).not.toContain(run.id);
	expect((await h.run((ctx, tx) => listRuns(ctx, tx, {}), parent)).map((item) => item.id)).toContain(run.id);
});

test("nested delegations reserve capacity that the parent cannot consume", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"harness":{"preset":"codex","model":"test-model"}}'::jsonb WHERE id=${root}`,
	);
	const { run } = await delegate(2);
	const nested = await h.run(
		(ctx, tx) =>
			reserveSubmanager(ctx, tx, {
				project: leaf,
				capacity: 1,
				brief: "Own the leaf.",
				requestId: "nested",
			}),
		{ actor: { kind: "agent", name: run.id } },
	);
	await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder" }), {
		actor: { kind: "agent", name: run.id },
	});
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: child }))).toBe(false);
	if (!nested.replay) expect(nested.config.harness).toMatchObject({ preset: "codex", model: "test-model" });
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: leaf }))).toBe(true);
	await expect(
		h.run((ctx, tx) => resize(ctx, tx, { id: nested.run.id, capacity: 2 }), { actor: { kind: "agent", name: run.id } }),
	).rejects.toThrow();
	await expect(h.run((ctx, tx) => resize(ctx, tx, { id: run.id, capacity: 1 }), parent)).rejects.toThrow();
});

test("a handoff preserves a saved wait and its assignment request through delegation and retirement", async () => {
	const { status_id } = await h.one<{ status_id: string }>(sql`SELECT status_id FROM tickets WHERE id=${ticket}`);
	await h.rows(sql`INSERT INTO manager_next_actions (id,project_id,ticket_id,status_id,assignment_request_id,reason,created_at)
		VALUES ('wait',${root},${ticket},${status_id},'stable-request','Wait for capacity.',${NOW})`);
	const { run } = await delegate();
	await h.read((tx) => refresh(tx, { now: NOW }));
	expect(await h.one(sql`SELECT project_id,state,assignment_request_id FROM manager_next_actions`)).toMatchObject({
		project_id: child,
		state: "waiting",
		assignment_request_id: "stable-request",
	});
	await expect(
		h.run((ctx, tx) => release(ctx, tx, { id: run.id, terminalId: run.terminalId }), parent),
	).rejects.toThrow();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id=${run.id}`);
	await h.run((ctx, tx) => release(ctx, tx, { id: run.id, terminalId: run.terminalId }), parent);
	await h.read((tx) => refresh(tx, { now: NOW }));
	expect(await h.one(sql`SELECT project_id,state,assignment_request_id FROM manager_next_actions`)).toMatchObject({
		project_id: root,
		state: "waiting",
		assignment_request_id: "stable-request",
	});
	await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", requestId: "stable-request" }), parent);
	expect(await h.one(sql`SELECT state FROM manager_next_actions`)).toMatchObject({ state: "assigned" });
});

test("a stopped submanager resumes its assignment and conversation", async () => {
	const { run } = await delegate();
	await h.rows(
		sql`UPDATE agent_runs SET closed_at=${NOW},session_id='saved-session',workspace_id='/tmp/saved-work' WHERE id=${run.id}`,
	);
	const resumed = await h.run(
		(ctx, tx) =>
			reserveSubmanager(
				ctx,
				tx,
				{
					project: child,
					capacity: 1,
					brief: "Finish the child projects.",
					requestId: "resume-child",
				},
				[run.terminalId!],
			),
		parent,
	);
	expect(resumed.run.id).toBe(run.id);
	expect(resumed.run.sessionId).toBe("saved-session");
	expect(resumed.run.workspaceId).toBe("/tmp/saved-work");
	expect(resumed.replay).toBe(false);
	if (!resumed.replay) expect(resumed.resume).toBe(true);
	expect(resumed.run.terminalId).not.toBe(run.terminalId);
});

test("a paused ancestor prevents submanager heartbeats", async () => {
	const { run } = await delegate();
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${root}`,
	);
	const sessions = [controllerSession(run.terminalId!)];
	await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(61) });
	expect(await h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(61) })).toBeNull();
});

test("a retired delegation gets a new assignment on the next delegation", async () => {
	const { run } = await delegate();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id=${run.id}`);
	await h.run((ctx, tx) => release(ctx, tx, { id: run.id, terminalId: run.terminalId }), parent);
	const next = await h.run(
		(ctx, tx) =>
			reserveSubmanager(ctx, tx, {
				project: child,
				capacity: 1,
				brief: "New task.",
				requestId: "next-delegation",
			}),
		parent,
	);
	expect(next.run.id).not.toBe(run.id);
});

test("handoff removes transferred tickets from the parent's unfinished dispatch work", async () => {
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('old',${root},1,'sent',${JSON.stringify([{ ticketId: ticket }])}::jsonb,${NOW},${NOW},${NOW})`);
	await delegate();
	const context = await h.read((tx) => coordination(tx, { id: "next", projectId: root }));
	expect(context.unfinished).toEqual([]);
});

test("retirement cancels an unresolved delivery even after handoff handles its work", async () => {
	const { run } = await delegate();
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('uncertain',${child},1,'unknown',${JSON.stringify([{ ticketId: ticket }])}::jsonb,${NOW},${NOW},${NOW})`);
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id=${run.id}`);
	await h.run((ctx, tx) => release(ctx, tx, { id: run.id, terminalId: run.terminalId }), parent);
	expect(await h.one(sql`SELECT state FROM manager_dispatches WHERE id='uncertain'`)).toMatchObject({
		state: "canceled",
	});
});

test("a repeated delegation start retains the chosen default account", async () => {
	await h.rows(sql`INSERT INTO harness_accounts (id,name,harness,profile_path,is_default,enabled,created_at,updated_at)
		VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAW','Default','claude','/tmp/account',true,true,${NOW},${NOW})`);
	const first = await delegate();
	expect(first.run.accountId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAW");
	expect((await delegate()).run.id).toBe(first.run.id);
});

test("a parent cannot start another delegation while its dispatch is paused", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${root}`,
	);
	await expect(delegate()).rejects.toThrow();
});

test("an archived descendant retains its wait and still consumes its reserved worker slot", async () => {
	const { run } = await delegate();
	await h.run((ctx, tx) => reserve(ctx, tx, { ticket: otherTicket, personaId: "builder" }), {
		actor: { kind: "agent", name: run.id },
	});
	await h.rows(sql`INSERT INTO manager_next_actions (id,project_id,ticket_id,status_id,assignment_request_id,reason,created_at)
		SELECT 'archived-wait',${child},id,status_id,'later','Wait.',${NOW} FROM tickets WHERE id=${otherTicket}`);
	await h.rows(sql`UPDATE projects SET archived_at=${NOW} WHERE id=${leaf}`);
	await h.read((tx) => refresh(tx, { now: NOW }));
	expect(await h.one(sql`SELECT state,eligible_at FROM manager_next_actions`)).toMatchObject({
		state: "waiting",
		eligible_at: null,
	});
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: child }))).toBe(false);
});
