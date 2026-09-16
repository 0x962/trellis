import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { list, recover } from "../../../../../src/services/controller/controller.ts";
import { coordination } from "../../../../../src/services/controller/coordination.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, NOW, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		projectId = await seedRoot(tx, "WRK");
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'WRK','attempt',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,run_id,terminal_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('dispatch',${projectId},'manager','attempt',4,'sent','[{"ticketId":"one"},{"ticketId":"two"}]'::jsonb,${NOW},${NOW},${NOW})`);
	});
});
const outcome = (ticketId: string | null) => ({
	ticketId,
	status: "no_action" as const,
	reason: "An active worker already owns the current task.",
});
const record = (outcomes: ReturnType<typeof outcome>[], generation = 4, name = "manager") =>
	h.run((ctx, tx) => handle(ctx, tx, { id: "dispatch", generation, outcomes }), { actor: { kind: "agent", name } });

test("delivery leaves work open and ticket outcomes survive restart independently", async () => {
	expect((await h.run((ctx, tx) => list(ctx, tx, { unhandled: true }))).length).toBe(1);
	const partial = await record([outcome("one")]);
	expect(partial.workState).toBe("open");
	expect(partial.handledAt).toBeNull();
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	const done = await record([outcome("two")]);
	expect(done.workState).toBe("handled");
	expect(done.outcomes).toHaveLength(2);
	expect(done.handledAt).toBe(NOW.toISOString());
	expect(await h.run((ctx, tx) => list(ctx, tx, { unhandled: true }))).toEqual([]);
	expect((await record([outcome("two")])).outcomes).toHaveLength(2);
});

test("a stale generation, another agent, or an unrelated ticket cannot acknowledge work", async () => {
	await expect(record([outcome("one")], 3)).rejects.toThrow();
	await expect(record([outcome("one")], 4, "worker")).rejects.toThrow();
	await expect(record([outcome("foreign")])).rejects.toThrow();
	expect((await h.one(sql`SELECT outcomes FROM manager_dispatches`)).outcomes).toEqual([]);
});

test("an empty heartbeat requires an explicit project outcome", async () => {
	await h.rows(sql`UPDATE manager_dispatches SET events='[]'::jsonb`);
	expect((await record([outcome(null)])).workState).toBe("handled");
});

test("an outcome proves unknown delivery without marking unrelated ticket work handled", async () => {
	await h.rows(sql`UPDATE manager_dispatches SET state='unknown'`);
	const result = await record([outcome("one")]);
	expect(result.state).toBe("sent");
	expect(result.workState).toBe("open");
});

test("later events include unfinished ticket work and the current policy version", async () => {
	await record([outcome("one")]);
	await h.rows(
		sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('policy','Manager','manager','Coordinate',${NOW},${NOW})`,
	);
	await h.rows(sql`UPDATE projects SET manager_config='{"personaId":"policy"}'::jsonb WHERE id=${projectId}`);
	const result = await h.read((tx) => coordination(tx, { id: "next", projectId }));
	expect(result.policy).toEqual({ personaId: "policy", updatedAt: NOW.toISOString() });
	expect(result.unfinishedCount).toBe(1);
	expect(result.unfinished[0]).toMatchObject({ id: "dispatch", generation: 4, workItems: [{ ticketId: "two" }] });
	await record([outcome("two")]);
	expect((await h.read((tx) => coordination(tx, { id: "next", projectId }))).unfinished).toEqual([]);
});

test("a replacement manager can finish prior work while a closed manager cannot", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='manager'`);
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at)
		VALUES ('replacement','Manager','Manager','manager','Manage',${projectId},'WRK','replacement-attempt',${NOW},${NOW})`);
	await expect(record([outcome("one")])).rejects.toThrow();
	expect((await record([outcome("one"), outcome("two")], 4, "replacement")).workState).toBe("handled");
});

test("recorded blocked work does not hide other tickets or future dispatches", async () => {
	await h.run(
		(ctx, tx) =>
			handle(ctx, tx, {
				id: "dispatch",
				generation: 4,
				outcomes: [
					{
						ticketId: "one",
						status: "blocked",
						reason: "A product decision remains open.",
						reference: "decision-comment",
					},
				],
			}),
		{ actor: { kind: "agent", name: "manager" } },
	);
	const remaining = await h.read((tx) => coordination(tx, { id: "next", projectId }));
	expect(remaining.unfinished[0]!.workItems.map((item) => item.ticketId)).toEqual(["two"]);
	expect((await record([outcome("two")])).workState).toBe("handled");
});

test("a delayed acknowledgement cannot replace a recorded ticket outcome", async () => {
	await record([outcome("one")]);
	await expect(
		h.run(
			(ctx, tx) =>
				handle(ctx, tx, {
					id: "dispatch",
					generation: 4,
					outcomes: [{ ticketId: "one", status: "blocked", reason: "A conflicting late result." }],
				}),
			{ actor: { kind: "agent", name: "manager" } },
		),
	).rejects.toThrow();
	expect((await record([outcome("one")])).outcomes).toEqual([outcome("one")]);
});

test("an older dispatch cannot cancel a capacity wait it never presented", async () => {
	const ticketId = await h.read(async (tx) => {
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		return seedTicket(tx, { projectId, rootId: projectId, statusId });
	});
	await h.rows(sql`UPDATE manager_dispatches SET events=${JSON.stringify([{ ticketId }])}::jsonb`);
	await h.rows(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
		VALUES ('newer',${projectId},5,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
	await h.run((ctx, tx) =>
		handle(ctx, tx, {
			id: "newer",
			generation: 5,
			outcomes: [{ ticketId, status: "queued", reason: "Start a worker when capacity opens." }],
		}),
	);
	await record([outcome(ticketId)]);
	expect(await h.rows(sql`SELECT id FROM manager_next_actions WHERE state='waiting'`)).toHaveLength(1);
});
