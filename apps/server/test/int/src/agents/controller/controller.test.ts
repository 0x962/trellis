import { expect, test } from "bun:test";
import { createController } from "../../../../../src/agents/controller/controller.ts";

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

test("the host dispatches on its timer without automatic copilot messages", async () => {
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
	expect(calls).toEqual([]);
	await time.fire();
	expect(calls).toEqual(["controller.dispatch"]);
	await time.fire();
	await host.stop();
	expect(calls).toEqual(["controller.dispatch", "controller.dispatch"]);
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
	await time.fire();
	expect(time.timers.size).toBe(0);
	finish();
	await host.stop();
	expect(dispatches).toBe(2);
	expect(time.timers.size).toBe(0);
});

test("a failed first tick logs its error and preserves the next scheduled tick", async () => {
	const time = clock();
	const errors: unknown[] = [];
	let attempts = 0;
	let dispatches = 0;
	const host = createController({
		clock: time,
		log: (_message, data) => {
			errors.push(data);
		},
		call: async (name) => {
			if (name === "controller.dispatch" && ++attempts === 1) throw new Error("Runtime socket unavailable");
			if (name === "controller.dispatch") dispatches++;
		},
	});
	await host.start();
	await time.fire();
	expect(errors).toEqual([{ error: "Runtime socket unavailable" }]);
	expect(time.timers.size).toBe(1);
	await time.fire();
	await host.stop();
	expect(attempts).toBe(2);
	expect(dispatches).toBe(1);
	expect(time.timers.size).toBe(0);
});

test("startup completes before a blocked initial dispatch and shutdown waits for that dispatch", async () => {
	const time = clock();
	const dispatch = Promise.withResolvers<void>();
	let dispatches = 0;
	const host = createController({
		clock: time,
		log: () => {},
		call: async (name) => {
			if (name === "controller.dispatch") {
				dispatches++;
				await dispatch.promise;
			}
		},
	});
	await host.start();
	expect(dispatches).toBe(0);
	await time.fire();
	expect(dispatches).toBe(1);
	let stopped = false;
	const stopping = host.stop().then(() => {
		stopped = true;
	});
	await Promise.resolve();
	expect(stopped).toBe(false);
	dispatch.resolve();
	await stopping;
	expect(stopped).toBe(true);
	expect(time.timers.size).toBe(0);
});
