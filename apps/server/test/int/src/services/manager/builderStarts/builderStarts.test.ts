import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reserve } from "../../../../../../src/services/agentRuns/reserve.ts";
import { claimBuilderStart } from "../../../../../../src/services/manager/builderStarts/claim.ts";
import { dispatchBuilderStarts } from "../../../../../../src/services/manager/builderStarts/dispatch.ts";
import { move } from "../../../../../../src/services/tickets/move.ts";
import { update } from "../../../../../../src/services/tickets/update.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticket: string;
const personaId = ulid();
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "AUTO", {
			manager_config: { personaId: null, directory: "", builder: { personaId, harness: { preset: "claude" } } },
		});
		const statuses = await seedStatuses(tx, projectId);
		ticket = await seedTicket(tx, { projectId, rootId: projectId, statusId: statuses.todo });
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
		);
	});
	await h.rebuild();
});

test.each(["update", "move"])("%s queues one automatic builder on a started transition", async (method) => {
	const change = method === "move" ? move : update;
	await h.run((ctx, tx) => change(ctx, tx, { ticket, status: "in-progress" }));
	await h.run((ctx, tx) => change(ctx, tx, { ticket, status: "in-progress" }));
	const pending = await h.rows(sql`SELECT ticket_id,state FROM builder_start_requests`);
	expect(pending).toEqual([{ ticket_id: ticket, state: "pending" }]);
});

test("a failed transaction leaves no automatic builder request", async () => {
	await expect(
		h.run(async (ctx, tx) => {
			await update(ctx, tx, { ticket, status: "in-progress" });
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
});

const requestId = async () =>
	(await h.one<{ id: string }>(sql`SELECT id FROM builder_start_requests WHERE state='pending'`)).id;

test("a committed request reserves one builder across repeated controller calls", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const id = await requestId();
	const first = await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id));
	expect(first?.run.kind).toBe("builder");
	expect(await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id))).toBeNull();
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticket}`)).toHaveLength(1);
});

test("an existing builder prevents an automatic duplicate", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	const id = await requestId();
	expect(await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id))).toBeNull();
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticket}`)).toHaveLength(1);
});

test("a move out of started cancels a pending builder", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const id = await requestId();
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "todo" }));
	expect(await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id))).toBeNull();
	expect(await h.rows(sql`SELECT id FROM agent_runs`)).toEqual([]);
});

test("a paused manager does not prevent its builder from starting", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const id = await requestId();
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${projectId}`,
	);
	expect((await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id)))?.run.kind).toBe("builder");
});

test("the dispatcher starts the builder after its reservation commits", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const ctx = { core: h.ctx(() => {}), newTx: h.read, emit: () => {} } as unknown as Parameters<
		typeof dispatchBuilderStarts
	>[0];
	let launches = 0;
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		expect(await h.rows(sql`SELECT id FROM agent_runs WHERE id=${input.run.id}`)).toHaveLength(1);
		expect(input.requiredTicketCategory).toBe("started");
		launches++;
		return { id: input.run.id };
	});
	expect(launches).toBe(1);
});

test("an agent cannot bypass the In Progress WIP limit through a board move", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	await h.rows(sql`UPDATE statuses SET wip_limit=1 WHERE project_id=${projectId} AND category='started'`);
	const { id: statusId } = await h.one<{ id: string }>(
		sql`SELECT id FROM statuses WHERE project_id=${projectId} AND category='todo'`,
	);
	const other = await h.read((tx) => seedTicket(tx, { projectId, rootId: projectId, statusId: statusId! }));
	await expect(
		h.run((ctx, tx) => move(ctx, tx, { ticket: other, status: "in-progress" }), {
			actor: { kind: "agent", name: "claude" },
		}),
	).rejects.toMatchObject({ code: "STATUS_FULL" });
});

test("an interrupted reservation without a protected launch descriptor reports failure", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const id = await requestId();
	const reservation = await h.run((ctx, tx) => claimBuilderStart(ctx, tx, id));
	const ctx = {
		core: h.ctx(() => {}),
		newTx: h.read,
		emit: () => {},
		home: `/tmp/trellis-missing-launch-${ulid()}`,
	} as unknown as Parameters<typeof dispatchBuilderStarts>[0];
	let attempt: string | undefined;
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		attempt = input.attempt.id;
		return { id: input.run.id };
	});
	expect(attempt).toBeUndefined();
	expect((await h.one(sql`SELECT state FROM builder_start_requests WHERE id=${id}`)).state).toBe("failed");
	expect((await h.one(sql`SELECT error FROM agent_runs WHERE id=${reservation!.run.id}`)).error).toContain("ENOENT");
	expect(await h.rows(sql`SELECT id FROM agent_runs WHERE ticket_id=${ticket}`)).toHaveLength(1);
});

test("a prelaunch error records a failed automatic request", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	const id = await requestId();
	const ctx = {
		core: h.ctx(() => {}),
		newTx: h.read,
		emit: () => {},
		home: `/tmp/trellis-missing-launch-${ulid()}`,
	} as unknown as Parameters<typeof dispatchBuilderStarts>[0];
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		await h.rows(sql`UPDATE agent_runs SET error='Harness unavailable',closed_at=now() WHERE id=${input.run.id}`);
		return { id: input.run.id };
	});
	expect(
		await h.one<{ state: string; error: string }>(sql`SELECT state,error FROM builder_start_requests WHERE id=${id}`),
	).toEqual({
		state: "failed",
		error: "Harness unavailable",
	});
});

test("a human create in started queues the default builder", async () => {
	const { create } = await import("../../../../../../src/services/tickets/create.ts");
	const created = await h.run((ctx, tx) =>
		create(ctx, tx, { project: projectId, title: "New work", status: "in-progress" }),
	);
	expect(await h.rows(sql`SELECT ticket_id FROM builder_start_requests WHERE state='pending'`)).toEqual([
		{ ticket_id: created.id },
	]);
});

test("an agent create cannot bypass the status WIP limit", async () => {
	const { create } = await import("../../../../../../src/services/tickets/create.ts");
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	await h.rows(sql`UPDATE statuses SET wip_limit=1 WHERE project_id=${projectId} AND category='started'`);
	await expect(
		h.run((ctx, tx) => create(ctx, tx, { project: projectId, title: "Overflow", status: "in-progress" }), {
			actor: { kind: "agent", name: "claude" },
		}),
	).rejects.toMatchObject({ code: "STATUS_FULL" });
});

test("a bulk transition rolls back every builder request when its last ticket exceeds WIP", async () => {
	const { updateMany } = await import("../../../../../../src/services/tickets/update.ts");
	const { id: statusId } = await h.one<{ id: string }>(
		sql`SELECT id FROM statuses WHERE project_id=${projectId} AND category='todo'`,
	);
	const other = await h.read((tx) => seedTicket(tx, { projectId, rootId: projectId, statusId }));
	await h.rows(sql`UPDATE statuses SET wip_limit=1 WHERE project_id=${projectId} AND category='started'`);
	await expect(
		h.run((ctx, tx) => updateMany(ctx, tx, { tickets: [ticket, other], status: "in-progress" }), {
			actor: { kind: "agent", name: "claude" },
		}),
	).rejects.toMatchObject({ code: "STATUS_FULL" });
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
});

test("a child inherits builder defaults and shares its parent's status limit", async () => {
	const { create } = await import("../../../../../../src/services/tickets/create.ts");
	const { seedChild } = await import("../../../../../fixtures/projects.ts");
	const child = await h.read((tx) => seedChild(tx, projectId, projectId, "child"));
	await h.rebuild();
	await h.run((ctx, tx) => update(ctx, tx, { ticket, status: "in-progress" }));
	await h.rows(sql`UPDATE statuses SET wip_limit=1 WHERE project_id=${projectId} AND category='started'`);
	await expect(
		h.run((ctx, tx) => create(ctx, tx, { project: child, title: "Child work", status: "in-progress" }), {
			actor: { kind: "agent", name: "claude" },
		}),
	).rejects.toMatchObject({ code: "STATUS_FULL" });
	const created = await h.run((ctx, tx) =>
		create(ctx, tx, { project: child, title: "Child work", status: "in-progress" }),
	);
	expect(
		await h.rows(sql`SELECT id FROM builder_start_requests WHERE ticket_id=${created.id} AND state='pending'`),
	).toHaveLength(1);
});

test("dispatch starts existing In Progress work after builder defaults become available", async () => {
	await h.rows(sql`UPDATE projects SET manager_config=manager_config - 'builder' WHERE id=${projectId}`);
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${projectId} AND category='started') WHERE id=${ticket}`,
	);
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || ${JSON.stringify({ builder: { personaId, harness: { preset: "claude" } } })}::jsonb WHERE id=${projectId}`,
	);
	const ctx = {
		core: h.ctx(() => {}),
		newTx: h.read,
		emit: () => {},
		home: `reconcile-${ulid()}`,
	} as unknown as Parameters<typeof dispatchBuilderStarts>[0];
	let launches = 0;
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		launches++;
		return { id: input.run.id };
	});
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		launches++;
		return { id: input.run.id };
	});
	expect(launches).toBe(1);
});

test("dispatch replaces a stopped builder with no saved conversation", async () => {
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${projectId} AND category='started') WHERE id=${ticket}`,
	);
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${run.run.id}`);
	const ctx = {
		core: h.ctx(() => {}),
		newTx: h.read,
		emit: () => {},
		home: `reconcile-${ulid()}`,
	} as unknown as Parameters<typeof dispatchBuilderStarts>[0];
	let launches = 0;
	await dispatchBuilderStarts(ctx, async (_ctx, input) => {
		launches++;
		return { id: input.run.id };
	});
	expect(launches).toBe(1);
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toHaveLength(1);
});
