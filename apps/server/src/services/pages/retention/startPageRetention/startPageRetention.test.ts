import { expect, test } from "bun:test";
import { startPageRetention } from "./startPageRetention.ts";

test("propagates the first failure and schedules no timer", async () => {
	const timers: number[] = [];
	await expect(
		startPageRetention({
			sweep: async () => {
				throw new Error("Page sweep failed");
			},
			setTimer: (_fn, ms) => {
				timers.push(ms);
				return 1;
			},
			clearTimer: () => {},
		}),
	).rejects.toThrow("Page sweep failed");
	expect(timers).toEqual([]);
});

test("runs each hour after success and waits for the last sweep at shutdown", async () => {
	const pending = Promise.withResolvers<void>();
	const timers: Array<{ fn: () => unknown; ms: number }> = [];
	let calls = 0;
	const runner = await startPageRetention({
		sweep: async () => {
			if (++calls === 2) await pending.promise;
		},
		setTimer: (fn, ms) => {
			timers.push({ fn, ms });
			return timers.length;
		},
		clearTimer: () => {},
	});
	expect(calls).toBe(1);
	expect(timers[0]!.ms).toBe(3_600_000);
	const sweep = timers[0]!.fn();
	let stopped = false;
	const stop = runner.stop().then(() => {
		stopped = true;
	});
	await Promise.resolve();
	expect(stopped).toBe(false);
	pending.resolve();
	await sweep;
	await stop;
	expect(timers).toHaveLength(1);
});

test("propagates a later failure without a retry", async () => {
	let run: () => unknown;
	let calls = 0;
	let timers = 0;
	const runner = await startPageRetention({
		sweep: async () => {
			if (++calls === 2) throw new Error("later failure");
		},
		setTimer: (fn) => {
			run = fn;
			return ++timers;
		},
		clearTimer: () => {},
	});
	await expect(run!()).rejects.toThrow("later failure");
	expect(timers).toBe(1);
	await expect(runner.stop()).rejects.toThrow("later failure");
});
