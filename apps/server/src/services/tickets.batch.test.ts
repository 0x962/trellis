import { describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { count, navid, seedChild, seedProject, seedRoot, seedStatuses, seedTicket } from "../../test/fixtures";
import {
	activityOf,
	distinct,
	expectErrorData,
	ticketHarness,
	ticketRow,
	traceRows,
} from "../../test/helpers/services.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

// A root with its six statuses and three tickets in Todo, In Progress, and Done.
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const base = { projectId: rootId, rootId };
	const ids = [
		await seedTicket(h.db, { ...base, statusId: statuses.todo, number: 1 }),
		await seedTicket(h.db, { ...base, statusId: statuses.started, number: 2 }),
		await seedTicket(h.db, { ...base, statusId: statuses.done, number: 3 }),
	];
	return { rootId, statuses, ids };
};

describe("tickets.updateMany", () => {
	test("updateMany is one batch and one transaction", async () => {
		const { ids } = await seed();
		const { result } = await h.as(navid)((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: ids, priority: "high" }));
		for (const id of ids) expect((await ticketRow(h.db, id))!.priority).toBe("high");
		const rows = await activityOf(h.db);
		expect(rows).toHaveLength(3);
		expect(distinct(rows.map((row) => row.batch_id))).toHaveLength(1);
		expect(result.items.map((item) => item.id).sort()).toEqual([...ids].sort());
		for (const item of result.items) expect(item.priority).toBe("high");
	});

	test("updateMany emits one event per ticket with the shared batch id", async () => {
		const { ids } = await seed();
		const { events } = await h.as(navid)((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: ids, priority: "high" }));
		const updated = events.filter((event) => event.type === "ticket.updated");
		expect(updated).toHaveLength(3);
		expect(updated.map((event) => event.summary.id).sort()).toEqual([...ids].sort());
		for (const event of updated) expect(event.summary.version).toBe(2);
		expect(distinct(updated.map((event) => event.batchId))).toHaveLength(1);
	});

	test("one bad ref rolls back the whole updateMany", async () => {
		const { ids } = await seed();
		const flushed: TrellisEvent[][] = [];
		const refs = [ids[0]!, "CDE-999", ids[2]!];
		const data = await expectErrorData(
			h.as(navid, (events) => {
				flushed.push(events);
			})((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: refs, priority: "high" })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
		for (const id of ids) expect((await ticketRow(h.db, id))!.priority).toBe("none");
		expect(await count(h.db, "activity")).toBe(0);
		expect(flushed).toEqual([]);
	});

	test("updateMany remaps every ticket status on a project change", async () => {
		const { rootId, ids } = await seed();
		const webId = await seedChild(h.db, rootId, rootId, "web");
		const web = await seedStatuses(h.db, webId);
		const { result } = await h.as(navid)((ctx, tx) =>
			tickets.updateMany(ctx, tx, { tickets: ids, project: "CDE.web" }),
		);
		const byId = new Map(result.items.map((item) => [item.id, item]));
		expect(byId.get(ids[0]!)?.status.id).toBe(web.todo);
		expect(byId.get(ids[1]!)?.status.id).toBe(web.started);
		expect(byId.get(ids[2]!)?.status.id).toBe(web.done);
		for (const id of ids) expect((await ticketRow(h.db, id))!.project_id).toBe(webId);
		await h.db.transaction((tx) => assertStatusInvariant(tx));
	});
});

describe("tickets.deleteMany", () => {
	test("deleteMany removes every ticket and leaves one trace row each", async () => {
		const { ids } = await seed();
		const { result } = await h.as(navid)((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: ids }));
		expect([...result.deleted].sort()).toEqual(["CDE-1", "CDE-2", "CDE-3"]);
		expect(await count(h.db, "tickets")).toBe(0);
		const traces = await traceRows(h.db);
		expect(traces).toHaveLength(3);
		for (const trace of traces) expect(trace.action).toBe("ticket.deleted");
		expect(distinct(traces.map((trace) => trace.batch_id))).toHaveLength(1);
	});

	test("deleteMany rolls back when one ticket sits in an archived project", async () => {
		const { ids } = await seed();
		const arcId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		const arc = await seedStatuses(h.db, arcId);
		const archived = await seedTicket(h.db, { projectId: arcId, rootId: arcId, statusId: arc.todo });
		await expectErrorData(
			h.as(navid)((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: [ids[0]!, archived] })),
			"PROJECT_ARCHIVED",
		);
		expect(await ticketRow(h.db, ids[0]!)).toBeDefined();
		expect(await ticketRow(h.db, archived)).toBeDefined();
	});
});
