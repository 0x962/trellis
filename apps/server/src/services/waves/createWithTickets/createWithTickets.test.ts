import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../../db/epicCancellation/fixture.ts";
import { ticketGet } from "../../../db/queries/ticketGet.ts";
import { updateDependencies } from "../../tickets/deps.ts";
import { createWithTickets } from "./createWithTickets.ts";

let h: Awaited<ReturnType<typeof fixture>>;
let epic: string;
beforeEach(async () => {
	h = await fixture();
	epic = (await h.create("Group")).id;
});
afterEach(async () => h.db.$client.close());
const create = (tickets: string[], name = "Selected work") =>
	h.run((tx) => createWithTickets(h.ctx(), tx, { epic, name, tickets }));

test("selected tickets move together and keep their parent and dependencies", async () => {
	const parent = await h.ticket(epic);
	const child = await h.ticket(epic, "todo", parent.id);
	await h.run((tx) => updateDependencies(h.ctx(), tx, { ticket: child.id, after: [parent.id] }));
	const before = await h.run((tx) => ticketGet(tx, child.id));
	h.events.length = 0;
	const wave = await create([parent.id, child.id]);
	expect(wave).toMatchObject({ epicId: epic, name: "Selected work", counts: { total: 2 } });
	const after = await h.run((tx) => ticketGet(tx, child.id));
	expect(after).toMatchObject({ wave: { id: wave.id }, parent: before.parent, waitsOn: before.waitsOn });
	expect(after.version).toBe(before.version + 1);
	expect(h.events.filter((event) => event.type === "ticket.updated")).toHaveLength(2);
	expect(h.events.some((event) => event.type === "epics.changed")).toBe(true);
});

test("notes-only selection creates an empty wave", async () => {
	expect(await create([])).toMatchObject({ epicId: epic, counts: { total: 0 } });
});

test("invalid or foreign members leave the epic unchanged", async () => {
	const own = await h.ticket(epic);
	const foreignEpic = (await h.create("Other")).id;
	const foreign = await h.ticket(foreignEpic);
	const before = await h.get(epic);
	await expect(create([own.id, foreign.id])).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(create([own.id, ulid()])).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(create([own.id, own.id])).rejects.toThrow("Select each ticket once.");
	expect(await h.get(epic)).toEqual(before);
});

test("a failed second ticket write rolls back the wave and first ticket write", async () => {
	const first = await h.ticket(epic);
	const second = await h.ticket(epic);
	await h.db.execute(
		sql`ALTER TABLE tickets ADD CONSTRAINT test_reject_second_move CHECK (number <> 2 OR version = 1)`,
	);
	const before = await h.get(epic);
	await expect(create([first.id, second.id])).rejects.toThrow();
	expect(await h.get(epic)).toEqual(before);
});

test("wave creation requires an actor and an active project", async () => {
	const input = { epic, name: "Group", tickets: [] };
	await expect(h.run((tx) => createWithTickets(h.ctx(null), tx, input))).rejects.toMatchObject({
		code: "ACTOR_REQUIRED",
	});
	await h.db.execute(sql`UPDATE projects SET archived_at = ${h.ctx().now} WHERE id = ${h.projectId}`);
	await h.run((tx) => h.cache.rebuild(tx));
	await expect(create([])).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	expect((await h.get(epic)).waves).toHaveLength(0);
});
