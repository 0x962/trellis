import { describe, expect, test } from "bun:test";
import {
	type ActorRef,
	claude,
	dana,
	seedActivity,
	seedProject,
	seedTicket,
	type TicketSeed,
} from "../../test/fixtures";
import { activityOf, distinct, millis, ticketHarness, ticketRow } from "../../test/helpers/services.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

const update = (actor: ActorRef, input: Record<string, unknown>) =>
	h.as(actor)((ctx, tx) => tickets.update(ctx, tx, input));

// A root with its six statuses and one ticket in Todo, titled Alpha.
const seed = async (extra: Partial<TicketSeed> = {}) => {
	const project = await seedProject(h.db);
	const { rootId, statuses } = project;
	const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Alpha", ...extra });
	return { ...project, id };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

// A description row an earlier update left behind, `minutes` ago, by `actor`.
const seedDescriptionRow = (rootId: string, id: string, actor: ActorRef, minutes: number) =>
	seedActivity(h.db, {
		rootId,
		projectId: rootId,
		ticketId: id,
		actor,
		field: "description",
		meta: { deltaChars: 5 },
		createdAt: minutesAgo(minutes),
	});

const descriptionRows = async (id: string) => (await activityOf(h.db, id)).filter((row) => row.field === "description");

describe("tickets.update activity", () => {
	test("update writes one activity row per changed field under one batch id", async () => {
		const { id } = await seed();
		await update(dana, { ticket: id, title: "Beta", priority: "high", status: "in-progress" });
		const rows = await activityOf(h.db, id);
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => row.field).sort()).toEqual(["priority", "status", "title"]);
		expect(distinct(rows.map((row) => row.batch_id))).toHaveLength(1);
	});

	test("update with unchanged values writes no activity and no version bump", async () => {
		const { id } = await seed({ priority: "high" });
		const before = (await ticketRow(h.db, id))!;
		await update(dana, { ticket: id, title: "Alpha", priority: "high" });
		const after = (await ticketRow(h.db, id))!;
		expect(await activityOf(h.db, id)).toHaveLength(0);
		expect(after.version).toBe(1);
		expect(millis(after.updated_at)).toBe(millis(before.updated_at));
	});

	test("a title activity row carries the old and the new text", async () => {
		const { id } = await seed();
		await update(dana, { ticket: id, title: "Beta" });
		const [row] = await activityOf(h.db, id);
		expect(row).toMatchObject({ action: "ticket.updated", field: "title", from_value: "Alpha", to_value: "Beta" });
	});

	test("a description activity row carries no text and reports deltaChars", async () => {
		const { id } = await seed({ description: "0123456789" });
		await update(dana, { ticket: id, description: "x".repeat(30) });
		const [row] = await descriptionRows(id);
		expect(row).toMatchObject({ field: "description", from_value: null, to_value: null });
		expect(row!.meta.deltaChars).toBe(20);
	});

	test("a second description change by the same actor inside 5 minutes writes no row", async () => {
		const { id, rootId } = await seed({ description: "first" });
		await seedDescriptionRow(rootId, id, claude, 2);
		await update(claude, { ticket: id, description: "second" });
		expect(await descriptionRows(id)).toHaveLength(1);
		const row = (await ticketRow(h.db, id))!;
		expect(row.description).toBe("second");
		expect(row.version).toBe(2);
	});

	test("a description change by another actor inside 5 minutes writes its own row", async () => {
		const { id, rootId } = await seed({ description: "first" });
		await seedDescriptionRow(rootId, id, claude, 2);
		await update(dana, { ticket: id, description: "second" });
		const rows = await descriptionRows(id);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toMatchObject({ actor_name: "dana", actor_kind: "human" });
	});

	test("a description change by the same actor after 5 minutes writes a row", async () => {
		const { id, rootId } = await seed({ description: "first" });
		await seedDescriptionRow(rootId, id, claude, 6);
		await update(claude, { ticket: id, description: "second" });
		expect(await descriptionRows(id)).toHaveLength(2);
	});

	test("a status activity row carries the names and the ids and categories in meta", async () => {
		const { id, statuses } = await seed();
		await update(dana, { ticket: id, status: "in-progress" });
		const [row] = await activityOf(h.db, id);
		expect(row).toMatchObject({ field: "status", from_value: "Todo", to_value: "In Progress" });
		expect(row!.meta).toEqual({
			fromId: statuses.todo,
			toId: statuses.started,
			fromCategory: "todo",
			toCategory: "started",
		});
	});

	test("a parent activity row carries the identifiers and a cleared parent", async () => {
		const { id, rootId, statuses } = await seed();
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 3 });
		await update(dana, { ticket: id, parent: "CDE-3" });
		await update(dana, { ticket: id, parent: null });
		const rows = (await activityOf(h.db, id)).filter((row) => row.field === "parent");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ from_value: null, to_value: "CDE-3" });
		expect(rows[1]).toMatchObject({ from_value: "CDE-3", to_value: null });
		expect((await ticketRow(h.db, id))!.parent_id).toBeNull();
	});
});
