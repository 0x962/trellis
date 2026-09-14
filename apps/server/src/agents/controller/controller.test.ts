import { expect, test } from "bun:test";
import { createController } from "./controller.ts";

const clock = () => {
	const timers = new Map<number, () => unknown>();
	let next = 0;
	return {
		now: () => new Date(),
		setTimer: (fn: () => unknown, _ms: number) => {
			timers.set(++next, fn);
			return next;
		},
		clearTimer: (id: number) => {
			timers.delete(id);
		},
		fire: async () => {
			const pending = [...timers.values()];
			timers.clear();
			for (const fn of pending) await fn();
			await Promise.resolve();
			await Promise.resolve();
		},
		timers,
	};
};

test("the host collects after startup and on its timer without browser events", async () => {
	const time = clock();
	const calls: string[] = [];
	const host = createController({
		clock: time,
		log: () => {},
		call: async (name) => {
			calls.push(name);
		},
	});
	await host.start();
	await host.start();
	expect(calls).toEqual(["controller.recover", "controller.collect", "controller.dispatch"]);
	await time.fire();
	await host.stop();
	expect(calls).toEqual([
		"controller.recover",
		"controller.collect",
		"controller.dispatch",
		"controller.collect",
		"controller.dispatch",
	]);
	expect(time.timers.size).toBe(0);
});

test("a tick waits for its send before the next timer", async () => {
	const time = clock();
	let finish!: () => void;
	let dispatches = 0;
	const host = createController({
		clock: time,
		log: () => {},
		call: async (name) => {
			if (name === "controller.dispatch" && ++dispatches === 2)
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
		},
	});
	await host.start();
	await time.fire();
	expect(time.timers.size).toBe(0);
	finish();
	await host.stop();
	expect(dispatches).toBe(2);
	expect(time.timers.size).toBe(0);
});
