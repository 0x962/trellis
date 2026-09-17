import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim, complete, recover } from "../../../../../src/services/controller/controller.ts";
import { seedActors, seedChild, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedActivity, seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticketId: string;
let todoStatusId: string;
let sessions: ReturnType<typeof controllerSession>[];
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	sessions = [controllerSession()];
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "HBT", { manager_config: { personaId: "persona", ade: "native" } });
		todoStatusId = await seedStatus(tx, {
			projectId,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId: todoStatusId });
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'HBT','native','attempt','session',${NOW},${NOW})`);
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES ('attempt','manager',1,'hash',${NOW})`,
		);
	});
});
const gather = (seconds: number) => h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(seconds) });
const take = (seconds: number) => h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(seconds) });
const batches = () => h.rows(sql`SELECT * FROM manager_dispatches ORDER BY created_at,id`);
const observation = (state: "ready" | "working" | "idle", seconds = 0) => {
	sessions[0]!.activity = { state, updatedAt: secondsAfter(seconds).toISOString() };
};
const event = (seconds: number) =>
	h.read((tx) => seedActivity(tx, { projectId, rootId: projectId, ticketId, createdAt: secondsAfter(seconds) }));

test("a quiet manager receives one durable heartbeat after more than 120 idle seconds", async () => {
	await gather(120);
	expect(await batches()).toHaveLength(0);
	await gather(121);
	const first = (await batches())[0]!;
	expect(first).toMatchObject({ state: "pending", events: [] });
	await h.run((ctx, tx) => recover(ctx, tx, {}), { now: secondsAfter(122) });
	await Promise.all([gather(600), gather(600)]);
	expect(await batches()).toHaveLength(1);
	expect((await take(600))?.id).toBe(first.id);
	expect(await h.rows(sql`SELECT * FROM agent_runs`)).toHaveLength(1);
});
test("an empty project receives no heartbeat", async () => {
	await h.rows(sql`DELETE FROM tickets`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("a project with only done and canceled tickets receives no heartbeat", async () => {
	await h.read(async (tx) => {
		const doneId = await seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 });
		const canceledId = await seedStatus(tx, { projectId, name: "Canceled", category: "canceled", position: 2 });
		await tx.execute(sql`UPDATE tickets SET status_id=${doneId},completed_at=${NOW} WHERE id=${ticketId}`);
		await seedTicket(tx, { projectId, rootId: projectId, statusId: canceledId, completedAt: NOW });
	});
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("an active worker keeps heartbeats active after its ticket reaches a terminal status", async () => {
	const doneId = await h.read((tx) => seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 }));
	await h.rows(sql`UPDATE tickets SET status_id=${doneId},completed_at=${NOW} WHERE id=${ticketId}`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,ticket_identifier,runtime,terminal_id,session_id,created_at,updated_at)
		VALUES ('worker','Builder','Builder','builder','Build',${projectId},'HBT',${ticketId},'HBT-1','native','worker-attempt','worker-session',${NOW},${NOW})`);
	await gather(600);
	expect((await take(600))?.events).toEqual([]);
});
test("a reopened ticket resumes heartbeats", async () => {
	const doneId = await h.read((tx) => seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 }));
	await h.rows(sql`UPDATE tickets SET status_id=${doneId},completed_at=${NOW} WHERE id=${ticketId}`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${projectId} AND category='todo'),completed_at=NULL WHERE id=${ticketId}`,
	);
	await gather(601);
	expect((await take(601))?.events).toEqual([]);
});
test("a new unfinished ticket resumes heartbeats for an empty project", async () => {
	await h.rows(sql`DELETE FROM tickets`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
	await h.read((tx) => seedTicket(tx, { projectId, rootId: projectId, statusId: todoStatusId }));
	await gather(601);
	expect((await take(601))?.events).toEqual([]);
});
test("an unfinished ticket in an unmanaged child keeps the parent heartbeat active", async () => {
	await h.rows(sql`DELETE FROM tickets`);
	const child = await h.read((tx) => seedChild(tx, projectId, projectId, "child"));
	await h.read((tx) => seedTicket(tx, { projectId: child, rootId: projectId, statusId: todoStatusId }));
	await gather(600);
	expect((await take(600))?.events).toEqual([]);
});
test("an unfinished ticket below another manager does not keep the parent heartbeat active", async () => {
	await h.rows(sql`DELETE FROM tickets`);
	const child = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "child", { manager_config: { personaId: "other", ade: "native" } }),
	);
	await h.read((tx) => seedTicket(tx, { projectId: child, rootId: projectId, statusId: todoStatusId }));
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("an active direct submanager keeps the parent heartbeat active", async () => {
	await h.rows(sql`DELETE FROM tickets`);
	const child = await h.read((tx) => seedChild(tx, projectId, projectId, "child"));
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
		VALUES ('submanager','Manager','Manager','manager','Manage',${child},'HBT.child','native','sub-attempt','sub-session',${NOW},${NOW})`);
	await h.rows(sql`INSERT INTO manager_delegations (run_id,parent_run_id,project_id,brief,created_at)
		VALUES ('submanager','manager',${child},'Own the child scope.',${NOW})`);
	await gather(600);
	expect((await take(600))?.events).toEqual([]);
});
test("a terminal ticket event still reaches the manager", async () => {
	const doneId = await h.read((tx) => seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 }));
	await h.rows(sql`UPDATE tickets SET status_id=${doneId},completed_at=${NOW} WHERE id=${ticketId}`);
	await event(0);
	await gather(60);
	expect((await take(60))?.events).toHaveLength(1);
});
test("heartbeat cadence starts from the last sent ticket batch", async () => {
	await event(59);
	await gather(60);
	expect((await batches())[0]?.events).toHaveLength(1);
	expect(await take(68)).toBeNull();
	const delivery = (await take(69))!;
	await h.run(
		(ctx, tx) => complete(ctx, tx, { id: delivery.id, generation: delivery.generation, state: "sent", error: null }),
		{ now: secondsAfter(70) },
	);
	await gather(190);
	expect(await batches()).toHaveLength(1);
	await gather(191);
	expect(await batches()).toHaveLength(2);
	expect((await take(191))?.events).toEqual([]);
});
test("new ticket activity joins a pending heartbeat without moving its deadline", async () => {
	await gather(121);
	await event(121);
	await gather(122);
	expect(await batches()).toHaveLength(1);
	expect((await take(122))?.events).toHaveLength(1);
});
test("a long turn gets a full 120 idle seconds after its latest observation", async () => {
	await observation("working", 10);
	await gather(1000);
	expect(await batches()).toHaveLength(0);
	await observation("idle", 1000);
	await gather(1120);
	expect(await batches()).toHaveLength(0);
	await gather(1121);
	expect((await take(1121))?.events).toEqual([]);
});
test("a working manager receives no heartbeat", async () => {
	observation("working");
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
for (const status of ["exited", "unknown"] as const) {
	test(`a ${status} process receives no heartbeat`, async () => {
		sessions[0]!.status = status;
		await gather(600);
		expect(await batches()).toHaveLength(0);
	});
}
test("missing, uncontrollable, and uninitialized processes receive no heartbeat", async () => {
	sessions = [];
	await gather(600);
	expect(await batches()).toHaveLength(0);
	sessions = [controllerSession("attempt", { controllable: false })];
	await gather(600);
	expect(await batches()).toHaveLength(0);
	sessions = [controllerSession("attempt", { activity: null })];
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("a different attempt cannot wake the assignment", async () => {
	sessions = [controllerSession("different")];
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("project pause suppresses heartbeats until dispatch resumes", async () => {
	await h.rows(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
	await h.rows(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":false}'::jsonb`);
	await gather(601);
	expect((await take(601))?.events).toEqual([]);
});

test("an unknown send blocks further heartbeats across recovery", async () => {
	await gather(121);
	const first = (await take(121))!;
	await h.run((ctx, tx) => recover(ctx, tx, {}), { now: secondsAfter(122) });
	await gather(3600);
	expect(await batches()).toHaveLength(1);
	expect((await batches())[0]).toMatchObject({ id: first.id, state: "unknown" });
	expect(await take(3600)).toBeNull();
});
test("archived projects and descendants receive no heartbeat", async () => {
	const child = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "child", { manager_config: { personaId: "persona", ade: "native" } }),
	);
	await h.rows(sql`UPDATE agent_runs SET project_id=${child}`);
	await h.rows(sql`UPDATE projects SET archived_at=${NOW} WHERE id=${projectId}`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
test("a project without a configured manager and a non-native run receive no heartbeat", async () => {
	await h.rows(sql`UPDATE agent_runs SET runtime='superset'`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
	await h.rows(sql`UPDATE agent_runs SET runtime='native'`);
	await h.rows(sql`UPDATE projects SET manager_config='{}'::jsonb`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
});

test("a new manager waits more than 120 seconds even when its runtime turn is older", async () => {
	await h.rows(sql`UPDATE agent_runs SET created_at=${secondsAfter(100)}`);
	await gather(220);
	expect(await batches()).toHaveLength(0);
	await gather(221);
	expect((await take(221))?.events).toEqual([]);
});

test("uncollected ticket work beyond a page of manager activity takes precedence", async () => {
	await h.read(async (tx) => {
		for (let index = 0; index < 100; index++)
			await seedActivity(tx, { projectId, rootId: projectId, ticketId: null, createdAt: NOW });
	});
	await event(0);
	await gather(121);
	expect(await batches()).toHaveLength(0);
	await gather(122);
	expect((await take(122))?.events).toHaveLength(1);
});

test("a closed assignment never receives a heartbeat even if its process remains live", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW}`);
	await gather(600);
	expect(await batches()).toHaveLength(0);
});

test.each(["working", "idle", "ready"] as const)(
	"a queued heartbeat is skipped after new %s activity",
	async (state) => {
		await gather(121);
		observation(state, 121);
		expect(await take(122)).toBeNull();
		expect((await batches())[0]).toMatchObject({ state: "canceled", work_state: "handled" });
		observation("idle", 123);
		await gather(243);
		expect(await batches()).toHaveLength(1);
		await gather(244);
		expect((await take(244))?.events).toEqual([]);
	},
);

test("a ready process has not completed an idle turn", async () => {
	observation("ready");
	await gather(600);
	expect(await batches()).toHaveLength(0);
});
