import { expect, test } from "bun:test";
import { PAGE_SEARCH_BACKFILL_INTERVAL_MS, startSearchBackfill } from "./startSearchBackfill.ts";

test("runs bounded batches until no Page needs an upgrade", async () => {
	const timers: Array<{ fn: () => unknown; ms: number }> = [];
	const logs: Array<{ message: string; fields?: Record<string, unknown> }> = [];
	const results = [
		{ updated: 4, pending: true },
		{ updated: 2, pending: false },
	];
	const runner = await startSearchBackfill({
		backfill: async () => results.shift()!,
		setTimer: (fn, ms) => {
			timers.push({ fn, ms });
			return timers.length;
		},
		clearTimer: () => {},
		log: (message, fields) => logs.push({ message, fields }),
	});

	expect(timers[0]!.ms).toBe(PAGE_SEARCH_BACKFILL_INTERVAL_MS);
	await timers[0]!.fn();
	expect(timers).toHaveLength(1);
	expect(logs).toEqual([
		{ message: "page search backfill", fields: { updated: 4 } },
		{ message: "page search backfill", fields: { updated: 2 } },
	]);
	await runner.stop();
});

test("stops after a later batch fails", async () => {
	const timers: Array<() => unknown> = [];
	const logs: string[] = [];
	let calls = 0;
	const runner = await startSearchBackfill({
		backfill: async () => {
			if (++calls === 2) throw new Error("object missing");
			return { updated: 4, pending: true };
		},
		setTimer: (fn) => {
			timers.push(fn);
			return timers.length;
		},
		clearTimer: () => {},
		log: (message) => logs.push(message),
	});

	await timers[0]!();
	expect(logs).toEqual(["page search backfill", "page search backfill failed"]);
	expect(timers).toHaveLength(1);
	await runner.stop();
});
