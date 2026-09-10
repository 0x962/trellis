import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ActivitySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { claude, navid, seedActivity, seedProject, seedRoot, seedStatuses, seedTicket } from "../../test/fixtures";
import {
	type ActivityRow,
	activityRows,
	type Harness,
	minutesAgo,
	NOW,
	serviceHarness,
	ULID,
} from "../../test/helpers/services.ts";
import { record } from "./activity.ts";

// The activity writer is the one path onto the activity table. One call
// writes one row per changed field under one batch id, stamped with the
// actor and the instant of the context. A description row carries no text,
// only `meta.deltaChars`, and a burst of edits by one actor inside five
// minutes stays one row. The session of the context lands in `meta.session`.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const seedCde = async () => {
	const { rootId: cde, statuses } = await seedProject(h.db, "CDE");
	const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: statuses.todo, number: 1 });
	return { cde, ticket, statuses };
};

type RecordInput = Parameters<typeof record>[2];

const write = (input: RecordInput, options: Parameters<Harness["run"]>[1] = {}) =>
	h.run((ctx, tx) => record(ctx, tx, input), options);

const toActivity = (row: ActivityRow) => ({
	id: row.id,
	batchId: row.batch_id,
	rootId: row.root_id,
	projectId: row.project_id,
	ticketId: row.ticket_id,
	actor: { name: row.actor_name, kind: row.actor_kind },
	action: row.action,
	field: row.field,
	fromValue: row.from_value,
	toValue: row.to_value,
	meta: row.meta,
	createdAt: row.created_at,
});

describe("activity.record rows", () => {
	test("one call writes one row per field with a shared batch id", async () => {
		const { cde, ticket } = await seedCde();
		const result = await write({
			rootId: cde,
			projectId: cde,
			ticketId: ticket,
			action: "ticket.updated",
			changes: [
				{ field: "title", from: "Old", to: "New" },
				{ field: "priority", from: "none", to: "high" },
			],
		});
		expect(result).toHaveLength(2);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.field)).toEqual(["title", "priority"]);
		expect(rows.map((row) => [row.from_value, row.to_value])).toEqual([
			["Old", "New"],
			["none", "high"],
		]);
		expect(rows[0]!.batch_id).toMatch(ULID);
		expect(rows[1]!.batch_id).toBe(rows[0]!.batch_id);
		for (const row of rows) {
			expect({ name: row.actor_name, kind: row.actor_kind }).toEqual(navid);
			expect(row.created_at).toBe(NOW.toISOString());
			expect(row.ticket_id).toBe(ticket);
			expect(row.action).toBe("ticket.updated");
		}
	});

	test("a description row carries deltaChars and no text", async () => {
		const { cde, ticket } = await seedCde();
		await write({
			rootId: cde,
			projectId: cde,
			ticketId: ticket,
			action: "ticket.updated",
			changes: [{ field: "description", from: "x".repeat(10), to: "x".repeat(130) }],
		});
		const rows = await activityRows(h);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.from_value).toBeNull();
		expect(rows[0]!.to_value).toBeNull();
		expect(rows[0]!.meta).toMatchObject({ deltaChars: 120 });
	});

	test("a status row carries the names in the values and the ids in meta", async () => {
		const { cde, ticket, statuses } = await seedCde();
		const meta = { fromId: statuses.todo, toId: statuses.done, fromCategory: "todo", toCategory: "done" };
		await write({
			rootId: cde,
			projectId: cde,
			ticketId: ticket,
			action: "ticket.updated",
			changes: [{ field: "status", from: "Todo", to: "Done", meta }],
		});
		const row = (await activityRows(h))[0]!;
		expect(row.from_value).toBe("Todo");
		expect(row.to_value).toBe("Done");
		expect(row.meta).toMatchObject(meta);
	});

	test("a project-level row carries a null ticket id", async () => {
		const { cde } = await seedCde();
		await write({
			rootId: cde,
			projectId: cde,
			ticketId: null,
			action: "project.updated",
			changes: [{ field: "name", from: "CDE", to: "Code" }],
		});
		const row = (await activityRows(h))[0]!;
		expect(row.ticket_id).toBeNull();
		expect(row.project_id).toBe(cde);
		expect(row.root_id).toBe(cde);
	});

	test("the session lands in meta and meta defaults to an empty object", async () => {
		const { cde, ticket } = await seedCde();
		const input: RecordInput = {
			rootId: cde,
			projectId: cde,
			ticketId: ticket,
			action: "ticket.updated",
			changes: [{ field: "title", from: "A", to: "B" }],
		};
		await write(input, { session: "s-1" });
		await write(input);
		const rows = await activityRows(h);
		expect(rows.map((row) => row.meta)).toEqual([{ session: "s-1" }, {}]);
	});
});

describe("activity.record description bursts", () => {
	// One description row written `minutes` ago by navid for the ticket.
	const seedBurst = async (minutes: number) => {
		const { cde, ticket } = await seedCde();
		await seedActivity(h.db, {
			rootId: cde,
			projectId: cde,
			ticketId: ticket,
			field: "description",
			meta: { deltaChars: 3 },
			createdAt: minutesAgo(minutes),
		});
		return { cde, ticket };
	};

	const writeDescription = (cde: string, ticket: string, actor = navid) =>
		write(
			{
				rootId: cde,
				projectId: cde,
				ticketId: ticket,
				action: "ticket.updated",
				changes: [{ field: "description", from: "a", to: "ab" }],
			},
			{ actor },
		);

	test("a second description change inside 5 minutes writes no row", async () => {
		const { cde, ticket } = await seedBurst(2);
		await writeDescription(cde, ticket);
		expect(await activityRows(h)).toHaveLength(1);
	});

	test("another actor's description change writes its own row", async () => {
		const { cde, ticket } = await seedBurst(2);
		await writeDescription(cde, ticket, claude);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(2);
		expect(rows[1]!.actor_name).toBe("claude");
	});

	test("a description change after 5 minutes writes a new row", async () => {
		const { cde, ticket } = await seedBurst(6);
		await writeDescription(cde, ticket);
		expect(await activityRows(h)).toHaveLength(2);
	});
});

describe("activity.record ordering and actors", () => {
	test("the writer upserts the actor before the insert", async () => {
		const cde = await seedRoot(h.db, "CDE");
		const statuses = await seedStatuses(h.db, cde);
		const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: statuses.todo });
		const unseen = { name: "fresh", kind: "agent" as const };
		await write(
			{
				rootId: cde,
				projectId: cde,
				ticketId: ticket,
				action: "ticket.updated",
				changes: [{ field: "title", from: "A", to: "B" }],
			},
			{ actor: unseen },
		);
		expect(await h.rows(sql`SELECT name, kind FROM actors`)).toEqual([unseen]);
		expect((await activityRows(h))[0]!.actor_name).toBe("fresh");
	});

	test("the activity ids rise with insertion order", async () => {
		const { cde, ticket } = await seedCde();
		const base = { rootId: cde, projectId: cde, ticketId: ticket, action: "ticket.updated" };
		await write({ ...base, changes: [{ field: "title", from: "A", to: "B" }] });
		await write({ ...base, changes: [{ field: "priority", from: "none", to: "low" }] });
		await write({ ...base, changes: [{ field: "title", from: "B", to: "C" }] });
		const rows = await activityRows(h);
		expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
		expect(rows.map((row) => row.to_value)).toEqual(["B", "low", "C"]);
		for (const row of rows) ActivitySchema.parse(toActivity(row));
	});
});
