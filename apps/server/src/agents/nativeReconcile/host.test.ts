import { expect, test } from "bun:test";
import { startNativeReconcile } from "./host.ts";

test("ticks cannot overlap and shutdown drains the active observation", async () => {
	let release!: () => void;
	let calls = 0;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let scheduled: (() => unknown) | undefined;
	const host = startNativeReconcile({
		tick: () => {
			calls++;
			return pending;
		},
		setTimer: (fn) => {
			scheduled = fn;
			return 1;
		},
		clearTimer: () => {
			scheduled = undefined;
		},
		log: () => {},
	});
	host.tick();
	expect(calls).toBe(1);
	let stopped = false;
	const stop = host.stop().then(() => {
		stopped = true;
	});
	await Promise.resolve();
	expect(stopped).toBe(false);
	release();
	await stop;
	expect(stopped).toBe(true);
	expect(scheduled).toBeUndefined();
	await host.tick();
	expect(calls).toBe(1);
});
test("the next tick starts only after the previous observation completes", async () => {
	let calls = 0;
	let scheduled: (() => unknown) | undefined;
	const host = startNativeReconcile({
		tick: async () => {
			calls++;
		},
		setTimer: (fn) => {
			scheduled = fn;
			return 1;
		},
		clearTimer: () => {
			scheduled = undefined;
		},
		log: () => {},
	});
	await host.tick();
	expect(calls).toBe(1);
	await scheduled!();
	expect(calls).toBe(2);
	await host.stop();
});
