import { expect, test } from "bun:test";
import { createController } from "../../../../../src/agents/controller/controller.ts";

const fixture = (execute: (manage: boolean) => Promise<void> = async () => {}) => {
	const timers = new Map<number, () => void>();
	let id = 0;
	const calls: boolean[] = [];
	const loop = createController({
		clock: {
			now: () => new Date("2026-09-17T03:00:00Z"),
			setTimer: (fn) => {
				timers.set(++id, fn);
				return id;
			},
			clearTimer: (key) => {
				timers.delete(key);
			},
		},
		log: () => {},
		call: async (_name, input) => {
			calls.push(input.manage);
			await execute(input.manage);
		},
	});
	const settle = async () => {
		for (let i = 0; i < 12; i++) await Promise.resolve();
	};
	return {
		loop,
		calls,
		timers,
		settle,
		fire: async () => {
			const tasks = [...timers.values()];
			timers.clear();
			for (const task of tasks) task();
			await settle();
		},
	};
};

test("pause suspends management and preserves message delivery; run now performs one pass", async () => {
	const f = fixture();
	await f.loop.start();
	f.loop.pause();
	await f.fire();
	expect(f.calls).toEqual([false]);
	expect(f.loop.read()).toMatchObject({ paused: true, working: false, runCount: 0 });
	f.loop.runNow();
	await f.settle();
	expect(f.calls).toEqual([false, true]);
	expect(f.loop.read()).toMatchObject({ paused: true, working: false, runCount: 1 });
	await f.fire();
	expect(f.calls).toEqual([false, true, false]);
	f.loop.resume();
	await f.settle();
	expect(f.calls.at(-1)).toBe(true);
	await f.loop.stop();
});

test("run now cannot overlap a current pass and pause lets that pass finish", async () => {
	const pending = Promise.withResolvers<void>();
	const f = fixture(() => pending.promise);
	await f.loop.start();
	await f.fire();
	f.loop.report("Recover workers", "Start TRL-1");
	f.loop.runNow();
	f.loop.runNow();
	f.loop.pause();
	expect(f.calls).toEqual([true]);
	expect(f.loop.read()).toMatchObject({ paused: true, working: true, step: "Recover workers" });
	expect(f.loop.read().output.some((entry) => entry.message === "Start TRL-1")).toBe(true);
	pending.resolve();
	await f.settle();
	expect(f.loop.read().working).toBe(false);
	await f.loop.stop();
});

test("errors remain visible after recovery and output stays bounded", async () => {
	let attempt = 0;
	const f = fixture(async () => {
		if (++attempt === 1) throw new Error("Runtime unavailable");
	});
	await f.loop.start();
	await f.fire();
	expect(f.loop.read()).toMatchObject({ lastError: "Runtime unavailable", working: false });
	await f.fire();
	expect(f.loop.read().lastError).toBeNull();
	expect(f.loop.read().errors[0]?.message).toContain("Runtime unavailable");
	for (let i = 0; i < 300; i++) f.loop.record(`Event ${i}`);
	expect(f.loop.read().output).toHaveLength(200);
	f.loop.clear();
	expect(f.loop.read().output).toEqual([]);
	expect(f.loop.read().errors).toEqual([]);
	await f.loop.stop();
});

test("step cards start at Wait, track parallel work, and retain errors on their source step", async () => {
	const f = fixture();
	expect(f.loop.read().steps[0]).toMatchObject({ id: "wait", active: true });
	const workers = Promise.withResolvers<void>();
	const messages = Promise.withResolvers<void>();
	const work = f.loop.runStep("workers", () => workers.promise);
	const delivery = f.loop.runStep("messages", () => messages.promise);
	expect(
		f.loop
			.read()
			.steps.filter((step) => step.active)
			.map((step) => step.id),
	).toEqual(["workers", "messages"]);
	messages.reject(new Error("Message delivery failed"));
	await expect(delivery).rejects.toThrow("Message delivery failed");
	expect(f.loop.read().errors[0]).toMatchObject({ stepId: "messages", message: "Message delivery failed" });
	expect(f.loop.read().steps.find((step) => step.id === "workers")?.active).toBe(true);
	workers.resolve();
	await work;
	await f.loop.start();
	await f.fire();
	expect(
		f.loop
			.read()
			.steps.filter((step) => step.active)
			.map((step) => step.id),
	).toEqual(["wait"]);
	expect(f.loop.read().errors[0]?.stepId).toBe("messages");
	await f.loop.stop();
});
