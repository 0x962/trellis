import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { hoursAgo, seedChild, seedProject, seedStatus, seedStatuses, seedTicket } from "../../../fixtures";
import { activityRows, at, type Harness, NOW, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import { remapScope } from "../../../../src/services/statuses.ts";

// `remapScope` restores the status invariant for the tickets of a scope:
// the project and every descendant below it that owns no statuses. Each
// ticket lands on the status of the target owner with the same name and
// category, else the lowest-position status of its category, else the
// target default. A remap is system work: one batch as system:trellis,
// a version bump, and no change to updated_at.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type TicketRow = {
	id: string;
	status_id: string;
	version: number;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string;
};

const ticketRow = (id: string) =>
	h.one<TicketRow>(
		sql`SELECT id, status_id, version, ${at("started_at")}, ${at("completed_at")}, ${at("updated_at")} FROM tickets WHERE id = ${id}`,
	);

const remap = (projectId: string, toOwnerId: string) =>
	h.run((ctx, tx) => remapScope(ctx, tx, { projectId, toOwnerId }));

// CDE owns the six seeded statuses. CDE > target owns a custom set. target >
// scope owns nothing, so owner(scope) is target. A ticket of scope that still
// points at a CDE status is the state a move leaves behind before the remap.
const seedTargets = async () => {
	const { rootId: cde, statuses: root } = await seedProject(h.db, "CDE");
	const target = await seedChild(h.db, cde, cde, "target");
	const t = {
		backlog: await seedStatus(h.db, {
			projectId: target,
			name: "Backlog",
			category: "todo",
			position: 0,
			isDefault: true,
		}),
		started: await seedStatus(h.db, { projectId: target, name: "in progress", category: "started", position: 1 }),
		qa: await seedStatus(h.db, { projectId: target, name: "QA", category: "review", reviewer: "agent", position: 2 }),
		shipped: await seedStatus(h.db, { projectId: target, name: "Shipped", category: "done", position: 3 }),
		signOff: await seedStatus(h.db, {
			projectId: target,
			name: "Sign off",
			category: "review",
			reviewer: "human",
			position: 4,
		}),
	};
	const scope = await seedChild(h.db, target, cde, "scope");
	await h.rebuild();
	return { cde, root, target, t, scope };
};

describe("remapScope matching", () => {
	test("remapScope matches by name first and ignores letter case", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		const ticket = await seedTicket(h.db, {
			projectId: scope,
			rootId: cde,
			statusId: root.started,
			startedAt: hoursAgo(1),
		});
		await remap(scope, target);
		expect((await ticketRow(ticket)).status_id).toBe(t.started);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("remapScope falls back to the lowest position of the same category", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		const ticket = await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: root.agentReview });
		await remap(scope, target);
		expect((await ticketRow(ticket)).status_id).toBe(t.qa);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("remapScope falls back to the target default", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		const ticket = await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: root.canceled });
		await remap(scope, target);
		expect((await ticketRow(ticket)).status_id).toBe(t.backlog);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("the scope stops at a descendant that owns statuses", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		const a = await seedChild(h.db, scope, cde, "a");
		const b = await seedChild(h.db, a, cde, "b");
		const own = await seedStatuses(h.db, b);
		const inScope = await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: root.todo });
		const inA = await seedTicket(h.db, { projectId: a, rootId: cde, statusId: root.done });
		const inB = await seedTicket(h.db, { projectId: b, rootId: cde, statusId: own.todo });
		await h.rebuild();
		expect(await remap(scope, target)).toBe(2);
		expect((await ticketRow(inScope)).status_id).toBe(t.backlog);
		expect((await ticketRow(inA)).status_id).toBe(t.shipped);
		expect((await ticketRow(inB)).status_id).toBe(own.todo);
		await h.read((tx) => assertStatusInvariant(tx));
	});
});

describe("remapScope bookkeeping", () => {
	test("remapScope leaves a ticket that is already correct alone", async () => {
		const { cde, target, t, scope } = await seedTargets();
		const ticket = await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: t.qa, updatedAt: hoursAgo(1) });
		expect(await remap(scope, target)).toBe(0);
		const row = await ticketRow(ticket);
		expect(row.status_id).toBe(t.qa);
		expect(row.version).toBe(1);
		expect(await activityRows(h)).toEqual([]);
		const ticketEvents = h.flushed.filter((event) => event.type.startsWith("ticket."));
		expect(ticketEvents).toEqual([]);
	});

	test("remapScope writes one row per moved ticket in one batch as system:trellis", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		const tickets: string[] = [];
		for (const statusId of [root.todo, root.started, root.agentReview, root.done]) {
			tickets.push(await seedTicket(h.db, { projectId: scope, rootId: cde, statusId }));
		}
		await remap(scope, target);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(4);
		expect(rows.map((row) => row.ticket_id).sort()).toEqual([...tickets].sort());
		expect(new Set(rows.map((row) => row.batch_id)).size).toBe(1);
		for (const row of rows) {
			expect(row.action).toBe("status.remapped");
			expect({ name: row.actor_name, kind: row.actor_kind }).toEqual({ name: "trellis", kind: "system" });
			expect(Object.keys(row.meta).sort()).toEqual(
				expect.arrayContaining(["fromCategory", "fromId", "toCategory", "toId"]),
			);
		}
		const first = rows.find((row) => row.ticket_id === tickets[0])!;
		expect(first.meta).toMatchObject({ fromId: root.todo, toId: t.backlog, fromCategory: "todo", toCategory: "todo" });
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a remap bumps the version and leaves updated_at", async () => {
		const { cde, root, target, scope } = await seedTargets();
		const before = hoursAgo(2);
		const ticket = await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: root.todo, updatedAt: before });
		await h.db.execute(sql`UPDATE tickets SET version = 4 WHERE id = ${ticket}`);
		await remap(scope, target);
		const row = await ticketRow(ticket);
		expect(row.version).toBe(5);
		expect(row.updated_at).toBe(before.toISOString());
	});

	test("a remap across categories applies the started and completed rules", async () => {
		const { cde, root, target, scope } = await seedTargets();
		await h.db.execute(sql`UPDATE statuses SET is_default = false WHERE project_id = ${target}`);
		await h.db.execute(sql`UPDATE statuses SET is_default = true WHERE project_id = ${target} AND name = 'Shipped'`);
		await h.db.execute(sql`DELETE FROM statuses WHERE project_id = ${target} AND name = 'in progress'`);
		await h.rebuild();
		const ticket = await seedTicket(h.db, {
			projectId: scope,
			rootId: cde,
			statusId: root.started,
			startedAt: hoursAgo(1),
		});
		await remap(scope, target);
		const row = await ticketRow(ticket);
		expect(row.started_at).toBe(hoursAgo(1).toISOString());
		expect(row.completed_at).toBe(NOW.toISOString());
	});

	test("remapScope returns the number of moved tickets", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		for (const statusId of [root.todo, root.started, root.humanReview, root.done]) {
			await seedTicket(h.db, { projectId: scope, rootId: cde, statusId });
		}
		await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: t.qa });
		await seedTicket(h.db, { projectId: scope, rootId: cde, statusId: t.shipped });
		expect(await remap(scope, target)).toBe(4);
	});

	test("the status invariant holds after every remap path", async () => {
		const { cde, root, target, t, scope } = await seedTargets();
		for (const statusId of [...Object.values(root), t.qa]) {
			await seedTicket(h.db, { projectId: scope, rootId: cde, statusId });
		}
		expect(await remap(scope, target)).toBe(6);
		await h.read((tx) => assertStatusInvariant(tx));
		expect(await remap(scope, target)).toBe(0);
		await h.read((tx) => assertStatusInvariant(tx));
	});
});
