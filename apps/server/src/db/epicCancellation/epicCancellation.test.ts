import { afterAll, beforeAll, expect, test } from "bun:test";
import { EpicSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { cancel } from "../../services/epics/cancel";
import { update as updateTicket } from "../../services/tickets/update.ts";
import { projectSummaryColumns, projectSummaryJoins } from "../queries/projectSummary.ts";
import { fixture } from "./fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	f = await fixture();
}, 30_000);
afterAll(async () => {
	await f.db.$client.close();
});

test("cancel updates all unfinished members and preserves completed tickets and assignments", async () => {
	const epic = await f.create("Stop this plan");
	const todo = await f.ticket(epic.id);
	const started = await f.ticket(epic.id, "started");
	const review = await f.ticket(epic.id, "review", todo.id);
	const done = await f.ticket(epic.id, "done");
	const canceled = await f.ticket(epic.id, "canceled");
	const outside = await f.create("Keep this plan");
	const other = await f.ticket(outside.id);
	const runId = ulid();
	await f.db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier,
			workspace_id, terminal_id, session_id, created_at, updated_at)
		VALUES (${runId}, 'Worker', 'agent', 'Complete this ticket.', ${f.projectId}, 'CAN',
			${started.id}, ${started.identifier}, '/fixture/work', 'attempt', 'conversation',
			${f.ctx().now}, ${f.ctx().now})`);
	const readAssignment = () => f.db.execute(sql`SELECT * FROM agent_runs WHERE id = ${runId}`);
	const assignment = await readAssignment();
	const before = await f.get(epic.id);
	const context = f.ctx();
	f.events.length = 0;
	const result = EpicSchema.parse(await f.cancel(epic.ref, context));
	expect(result.state).toBe("canceled");
	expect(result.counts).toEqual({ total: 5, todo: 0, started: 0, review: 0, done: 1, canceled: 4 });
	expect(result.currentWave).toBeNull();
	expect(result.currentWaveIndex).toBeNull();
	expect(result.waves.map((wave) => wave.id)).toEqual(before.waves.map((wave) => wave.id));
	expect(result.tickets.map((ticket) => ticket.id)).toEqual(before.tickets.map((ticket) => ticket.id));
	for (const ticket of [todo, started, review]) {
		const after = result.tickets.find((member) => member.id === ticket.id)!;
		expect(after.status.name).toBe("Abandoned");
		expect(after.completedAt).toBe(context.now.toISOString());
		expect(after.version).toBe(ticket.version + 1);
		expect(after.epic).toEqual(ticket.epic);
		expect(after.wave).toEqual(ticket.wave);
	}
	for (const ticket of [done, canceled]) {
		expect(result.tickets.find((member) => member.id === ticket.id)).toEqual(
			before.tickets.find((member) => member.id === ticket.id),
		);
	}
	expect((await f.get(outside.id)).tickets[0]).toMatchObject({ id: other.id, version: other.version });
	expect(await readAssignment()).toEqual(assignment);
	const activity = await f.db.execute(sql`SELECT ticket_id, from_value, to_value, meta FROM activity
		WHERE ticket_id IN (${todo.id}, ${started.id}, ${review.id}) AND field = 'status' ORDER BY id`);
	expect(activity.rows.map((row) => [row.ticket_id, row.to_value])).toEqual(
		[todo, started, review].map((ticket) => [ticket.id, "Abandoned"]),
	);
	const updates = f.events.filter((event) => event.type === "ticket.updated");
	expect(updates).toHaveLength(3);
	expect(new Set(updates.map((event) => event.batchId)).size).toBe(1);
	expect(updates.every((event) => event.fields.includes("status"))).toBe(true);
	expect(f.events.at(-1)).toEqual({ type: "epics.changed", projectId: f.projectId, id: epic.id });
});

test("an empty canceled epic stays canceled across reads and leaves the open count", async () => {
	const epic = await f.create("Empty canceled plan");
	const project = async () =>
		(
			await f.db.execute(sql`SELECT ${projectSummaryColumns}
		${projectSummaryJoins} WHERE p.id = ${f.projectId}`)
		).rows[0]!;
	const before = (await project()).open_epic_count as number;
	await f.cancel(epic.id);
	expect((await f.get(epic.id)).state).toBe("canceled");
	expect((await project()).open_epic_count).toBe(before - 1);
	const list = await f.list();
	expect(list.find((row) => row.id === epic.id)?.state).toBe("canceled");
	const rank = { open: 0, done: 1, canceled: 2 };
	expect(list.map((row) => rank[row.state])).toEqual(list.map((row) => rank[row.state]).sort());
});

test("repeat cancellation keeps the saved timestamps and adds no ticket activity", async () => {
	const epic = await f.create("Repeat cancellation");
	await f.ticket(epic.id);
	const first = await f.cancel(epic.id);
	f.events.length = 0;
	expect(await f.cancel(epic.id)).toEqual(first);
	expect(f.events).toEqual([]);
});

test("cancel includes tickets beyond the default list page", async () => {
	const epic = await f.create("Complete membership");
	for (let index = 0; index < 51; index++) await f.ticket(epic.id);
	const result = await f.cancel(epic.id);
	expect(result.counts.canceled).toBe(51);
	expect(result.tickets).toHaveLength(51);
	expect(result.tickets.every((ticket) => ticket.status.category === "canceled")).toBe(true);
});

test("cancel also closes a ticket that a person reopens in a canceled epic", async () => {
	const epic = await f.create("Reopened member");
	const ticket = await f.ticket(epic.id);
	await f.cancel(epic.id);
	await f.run((tx) => updateTicket(f.ctx(), tx, { ticket: ticket.id, status: "category:started" }));
	const result = await f.cancel(epic.id);
	expect(result.state).toBe("canceled");
	expect(result.tickets[0]?.status.category).toBe("canceled");
});

test("a failure rolls back both the epic marker and all ticket changes", async () => {
	const epic = await f.create("Atomic cancellation");
	await f.ticket(epic.id);
	const before = await f.get(epic.id);
	await expect(
		f.run(async (tx) => {
			await cancel(f.ctx(), tx, { epic: epic.id });
			throw new Error("Rollback fixture");
		}),
	).rejects.toThrow("Rollback fixture");
	expect(await f.get(epic.id)).toEqual(before);
});

test("cancel requires an actor and an active project", async () => {
	const epic = await f.create("Protected cancellation");
	await expect(f.cancel(epic.id, f.ctx(null))).rejects.toMatchObject({ code: "ACTOR_REQUIRED" });
	await f.db.execute(sql`UPDATE projects SET archived_at = ${f.ctx().now} WHERE id = ${f.projectId}`);
	await f.run((tx) => f.cache.rebuild(tx));
	try {
		await expect(f.cancel(epic.id)).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		expect((await f.get(epic.id)).state).toBe("open");
	} finally {
		await f.db.execute(sql`UPDATE projects SET archived_at = NULL WHERE id = ${f.projectId}`);
		await f.run((tx) => f.cache.rebuild(tx));
	}
});

test("missing project cancellation status refuses the whole change", async () => {
	const epic = await f.create("Missing cancellation status");
	await f.ticket(epic.id);
	const before = await f.get(epic.id);
	await f.db.execute(sql`UPDATE statuses SET category = 'done'
		WHERE project_id = ${f.projectId} AND category = 'canceled'`);
	await f.run((tx) => f.cache.rebuild(tx));
	try {
		await expect(f.cancel(epic.id)).rejects.toMatchObject({ code: "STATUS_NOT_IN_PROJECT" });
		expect(await f.get(epic.id)).toEqual(before);
	} finally {
		await f.db.execute(sql`UPDATE statuses SET category = 'canceled'
			WHERE project_id = ${f.projectId} AND slug = 'abandoned'`);
		await f.run((tx) => f.cache.rebuild(tx));
	}
});
