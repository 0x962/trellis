import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { StatusClearOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import {
	count,
	seedActors,
	seedChild,
	seedProject,
	seedRoot,
	seedStatus,
	seedStatuses,
	seedTicket,
} from "../../../fixtures";
import { activityRows, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import * as statuses from "../../../../src/services/statuses.ts";

// A clear drops the own set of a sub-project, so it inherits the nearest
// owner's set again, and remaps the tickets of its scope onto that set by
// name, then by category, then onto the default. A root keeps its set.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const clear = (project: string) => h.run((ctx, tx) => statuses.clear(ctx, tx, { project }));

const ownStatuses = (projectId: string) =>
	h.rows<{ id: string }>(sql`SELECT id FROM statuses WHERE project_id = ${projectId}`);

const ticketStatuses = () =>
	h.rows<{ id: string; status_id: string }>(sql`SELECT id, status_id FROM tickets ORDER BY number`);

// CDE > web, where web owns a copy of the six statuses and holds two tickets.
const seedOwningChild = async () => {
	const { rootId: cde, statuses: root } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, cde, cde, "web");
	const own = await seedStatuses(h.db, web);
	const t1 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: own.todo, number: 1 });
	const t2 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: own.done, number: 2 });
	await h.rebuild();
	return { cde, web, root, own, t1, t2 };
};

describe("statuses.clear", () => {
	test("clear drops the own set and returns the new owner", async () => {
		const { cde, web, root } = await seedOwningChild();
		const result = await clear("CDE.web");
		expect(StatusClearOutputSchema.parse(result)).toEqual({ inheritedFrom: cde, remapped: 2 });
		expect(await ownStatuses(web)).toEqual([]);
		const effective = await h.read(async (tx) => {
			await h.cache.rebuild(tx);
			return h.cache.effectiveStatuses(web);
		});
		expect(effective.ownerId).toBe(cde);
		expect(effective.statuses.map((status) => status.id)).toEqual(Object.values(root));
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("clear remaps the subtree by name, then category, then default", async () => {
		await seedActors(h.db);
		const cde = await seedRoot(h.db, "CDE");
		const rootTodo = await seedStatus(h.db, {
			projectId: cde,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		const rootStarted = await seedStatus(h.db, {
			projectId: cde,
			name: "In Progress",
			category: "started",
			position: 1,
		});
		const rootDone = await seedStatus(h.db, { projectId: cde, name: "Done", category: "done", position: 2 });
		const web = await seedChild(h.db, cde, cde, "web");
		const webTodo = await seedStatus(h.db, {
			projectId: web,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		const webDoing = await seedStatus(h.db, { projectId: web, name: "Doing", category: "started", position: 1 });
		const webReview = await seedStatus(h.db, {
			projectId: web,
			name: "Review",
			category: "review",
			reviewer: "agent",
			position: 2,
		});
		const webDone = await seedStatus(h.db, { projectId: web, name: "Done", category: "done", position: 3 });
		const seed = { projectId: web, rootId: cde };
		const byName = await seedTicket(h.db, { ...seed, statusId: webTodo, number: 1 });
		const byCategory = await seedTicket(h.db, { ...seed, statusId: webDoing, number: 2 });
		const byDefault = await seedTicket(h.db, { ...seed, statusId: webReview, number: 3 });
		const done = await seedTicket(h.db, { ...seed, statusId: webDone, number: 4 });
		await h.rebuild();
		const result = await clear("CDE.web");
		expect(result.remapped).toBe(4);
		expect(await ticketStatuses()).toEqual([
			{ id: byName, status_id: rootTodo },
			{ id: byCategory, status_id: rootStarted },
			{ id: byDefault, status_id: rootTodo },
			{ id: done, status_id: rootDone },
		]);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a root cannot clear its statuses", async () => {
		const { cde } = await seedOwningChild();
		await expectError(clear("CDE"), "ROOT_STATUSES");
		expect(await ownStatuses(cde)).toHaveLength(6);
	});

	test("a clear on an inheriting project changes nothing", async () => {
		const { rootId: cde, statuses: root } = await seedProject(h.db, "CDE");
		const web = await seedChild(h.db, cde, cde, "web");
		await seedTicket(h.db, { projectId: web, rootId: cde, statusId: root.todo });
		await h.rebuild();
		const result = await clear("CDE.web");
		expect(result).toEqual({ inheritedFrom: cde, remapped: 0 });
		expect(await activityRows(h)).toEqual([]);
		expect(await count(h.db, "statuses")).toBe(6);
	});

	// A sink that queries while the transaction is open waits on the lock the
	// transaction holds and the test times out.
	test("clear emits statuses.changed", async () => {
		const { web } = await seedOwningChild();
		const observed: Array<{ types: string[]; own: number }> = [];
		await h.runWithSink(
			(ctx, tx) => statuses.clear(ctx, tx, { project: "CDE.web" }),
			async (events) => {
				observed.push({ types: events.map((event) => event.type), own: (await ownStatuses(web)).length });
			},
		);
		expect(observed).toHaveLength(1);
		expect(observed[0]!.own).toBe(0);
		expect(observed[0]!.types).toContain("statuses.changed");
	}, 2000);
});
