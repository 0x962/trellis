import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createCache } from "../../../../db/cache.ts";
import { reserve } from "../../../agentRuns/reserve.ts";
import { create as createWave, remove as removeWave } from "../../../waves/waves.ts";
import { cancel } from "../../cancel";
import { fixture, harness } from "../components/fixture";
import { reserveNext } from "./reserveNext.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("concurrent checks reserve at most the configured capacity", async () => {
	await h.enable(2);
	for (let i = 0; i < 5; i++) await h.ticket(`Ticket ${i}`);
	const results = await Promise.all(Array.from({ length: 8 }, () => h.next()));
	const reservations = results.filter((result) => result !== null);
	expect(reservations).toHaveLength(2);
	expect(new Set(reservations.map((result) => result.run.ticketId)).size).toBe(2);
	const statuses = await h.db.execute(sql`SELECT s.category, count(*)::int AS count FROM tickets t
		JOIN statuses s ON s.id = t.status_id GROUP BY s.category`);
	expect(statuses.rows).toEqual(
		expect.arrayContaining([
			{ category: "started", count: 2 },
			{ category: "todo", count: 3 },
		]),
	);
});

test("dependencies decide readiness across waves and accept done or canceled blockers", async () => {
	await h.enable(5);
	const blocker = await h.ticket("Blocker", { status: "category:review" });
	const blocked = await h.ticket("Blocked", { after: [blocker.id] });
	const laterWave = await h.run((tx) => createWave(h.ctx, tx, { epic: h.epic.id, name: "Later" }));
	const later = await h.ticket("Ready in later wave", { wave: laterWave.id });
	expect((await h.next())?.run.ticketId).toBe(later.id);
	expect(await h.next()).toBeNull();
	await h.status(blocker.id, "done");
	expect((await h.next())?.run.ticketId).toBe(blocked.id);
	const canceled = await h.ticket("Canceled", { status: "category:canceled" });
	const released = await h.ticket("Released", { after: [canceled.id] });
	expect((await h.next())?.run.ticketId).toBe(released.id);
});

test("manual assignments consume slots until review and retain their assignment", async () => {
	await h.enable(1);
	const manual = await h.ticket("Manual");
	const next = await h.ticket("Next");
	const manualRun = await h.run((tx) => reserve(h.ctx, tx, { ticket: manual.id, harness }));
	expect(await h.next()).toBeNull();
	await h.status(manual.id, "review");
	expect((await h.next())?.run.ticketId).toBe(next.id);
	const assignment = await h.db.execute(sql`SELECT closed_at FROM agent_runs WHERE id = ${manualRun.run.id}`);
	expect(assignment.rows).toEqual([{ closed_at: null }]);
});

test("deleting a wave keeps its ready tickets eligible", async () => {
	await h.enable(1);
	const ticket = await h.ticket("Keep in epic");
	await h.run((tx) => removeWave(h.ctx, tx, { wave: h.wave.id, force: true }));
	expect((await h.next())?.run.ticketId).toBe(ticket.id);
});

test("lowering the limit preserves assignments and waits for capacity", async () => {
	await h.enable(2);
	for (let i = 0; i < 3; i++) await h.ticket(`Ticket ${i}`);
	const first = await h.next();
	const second = await h.next();
	await h.enable(1);
	expect(await h.next()).toBeNull();
	await h.status(first!.run.ticketId!, "review");
	expect(await h.next()).toBeNull();
	await h.status(second!.run.ticketId!, "done");
	expect(await h.next()).not.toBeNull();
});

test("disabled, archived, and canceled epics start no ticket", async () => {
	await h.ticket("Waiting");
	expect(await h.next()).toBeNull();
	await h.enable(2, false);
	expect(await h.next()).toBeNull();
	await h.enable();
	await h.db.execute(sql`UPDATE projects SET archived_at = ${h.ctx.now} WHERE id = ${h.projectId}`);
	expect(await h.next()).toBeNull();
	await h.db.execute(sql`UPDATE projects SET archived_at = NULL WHERE id = ${h.projectId}`);
	await h.run((tx) => cancel(h.ctx, tx, { epic: h.epic.id }));
	expect(await h.next()).toBeNull();
});

test("a saved reservation survives a new cache and is not started twice", async () => {
	await h.enable(1);
	const ticket = await h.ticket("Reserved");
	const first = await h.next();
	const cache = createCache();
	await h.run((tx) => cache.rebuild(tx));
	expect((await h.get())?.enabled).toBe(true);
	expect(await h.run((tx) => reserveNext({ ...h.ctx, cache }, tx, { epicId: h.epic.id }))).toBeNull();
	const runs = await h.db.execute(sql`SELECT id FROM agent_runs WHERE ticket_id = ${ticket.id}`);
	expect(runs.rows).toEqual([{ id: first!.run.id }]);
});
