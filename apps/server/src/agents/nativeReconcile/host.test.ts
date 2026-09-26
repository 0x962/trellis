import { expect, test } from "bun:test";
import { startNativeReconcile } from "./host.ts";

for (const overlap of [false, true]) {
	test(`the host ${overlap ? "scans during" : "waits for"} an active pass and drains work on stop`, async () => {
		const held = Promise.withResolvers<void>();
		const timers = new Map<number, () => unknown>();
		let calls = 0;
		let timerId = 0;
		const host = startNativeReconcile({
			overlap,
			tick: async () => {
				calls++;
				await held.promise;
			},
			setTimer: (fn, ms) => {
				expect(ms).toBe(1000);
				timers.set(++timerId, fn);
				return timerId;
			},
			clearTimer: (id) => {
				timers.delete(id);
			},
			log: () => {},
		});
		expect(calls).toBe(1);
		expect(timers.size).toBe(overlap ? 1 : 0);
		if (overlap) {
			const timer = timers.get(timerId)!;
			timers.delete(timerId);
			void timer();
			expect(calls).toBe(2);
		}
		let stopped = false;
		const stop = host.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		expect(timers.size).toBe(0);
		held.resolve();
		await stop;
		await host.tick();
		expect(calls).toBe(overlap ? 2 : 1);
		expect(timers.size).toBe(0);
	});
}
