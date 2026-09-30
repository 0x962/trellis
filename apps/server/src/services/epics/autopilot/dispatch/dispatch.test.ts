import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Tx } from "../../../../db/tx.ts";
import type { IoCtx } from "../../../support.ts";
import { fixture } from "../components/fixture";
import { dispatch } from "./dispatch.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await Promise.all(h.background);
	await h.db.$client.close();
});

test("dispatch launches committed reservations once and refills after review", async () => {
	await h.enable(2);
	for (let i = 0; i < 3; i++) await h.ticket(`Ticket ${i}`);
	const launched: string[] = [];
	const start: Parameters<typeof dispatch>[2] = async (ctx, input) => {
		const rows = await ctx.newTx((tx) =>
			tx.execute(sql`SELECT s.category FROM tickets t
			JOIN statuses s ON s.id = t.status_id WHERE t.id = ${input.run.ticketId}`),
		);
		expect(rows.rows).toEqual([{ category: "started" }]);
		expect(input.preserveAssignmentOnFailure).toBe(true);
		launched.push(input.run.ticketId!);
		return { id: input.run.id };
	};
	await dispatch(h.io, {}, start);
	await Promise.all(h.background);
	expect(launched).toHaveLength(2);
	await dispatch(h.io, {}, start);
	expect(launched).toHaveLength(2);
	await h.status(launched[0]!, "review");
	await dispatch(h.io, {}, start);
	await Promise.all(h.background);
	expect(new Set(launched).size).toBe(3);
});

test("rollback starts no process and emits no ticket event", async () => {
	await h.enable(1);
	await h.ticket("Rollback");
	h.events.length = 0;
	let transactions = 0;
	const io: IoCtx = {
		...h.io,
		newTx: <T>(fn: (tx: Tx) => Promise<T>) =>
			h.run(async (tx) => {
				transactions++;
				const result = await fn(tx);
				if (transactions === 2) throw new Error("Commit refused");
				return result;
			}),
	};
	let starts = 0;
	await expect(
		dispatch(io, {}, async (_ctx, input) => {
			starts++;
			return { id: input.run.id };
		}),
	).rejects.toThrow();
	expect(starts).toBe(0);
	expect(h.events).toEqual([]);
	expect((await h.db.execute(sql`SELECT id FROM agent_runs`)).rows).toEqual([]);
});

test("disable during dispatch stops further reservations and keeps the accepted start", async () => {
	await h.enable(3);
	for (let i = 0; i < 3; i++) await h.ticket(`Ticket ${i}`);
	const queued: Array<(ctx: IoCtx) => Promise<void>> = [];
	let reservations = 0;
	const io: IoCtx = {
		...h.io,
		background: (task) => {
			queued.push(task);
		},
		newTx: async <T>(fn: (tx: Tx) => Promise<T>) => {
			const result = await h.run(fn);
			reservations++;
			if (reservations === 2) await h.enable(3, false);
			return result;
		},
	};
	const launched: string[] = [];
	await dispatch(io, {}, async (_ctx, input) => {
		launched.push(input.run.id);
		return { id: input.run.id };
	});
	expect(queued).toHaveLength(1);
	await queued[0]!(h.io);
	expect(launched).toHaveLength(1);
	expect((await h.db.execute(sql`SELECT id FROM agent_runs WHERE closed_at IS NULL`)).rows).toHaveLength(1);
});

test("a launch failure keeps its slot and receives no automatic second start", async () => {
	await h.enable(1);
	await h.ticket("Failed launch");
	await h.ticket("Waiting for capacity");
	const failures: unknown[] = [];
	const io: IoCtx = {
		...h.io,
		background: (task) => {
			h.background.push(
				task(io).catch((error) => {
					failures.push(error);
				}),
			);
		},
	};
	let starts = 0;
	const start: Parameters<typeof dispatch>[2] = async () => {
		starts++;
		throw new Error("Provider unavailable");
	};
	await dispatch(io, {}, start);
	await Promise.all(h.background);
	await dispatch(io, {}, start);
	expect(starts).toBe(1);
	expect(failures).toHaveLength(1);
	expect((await h.db.execute(sql`SELECT id FROM agent_runs WHERE closed_at IS NULL`)).rows).toHaveLength(1);
});
