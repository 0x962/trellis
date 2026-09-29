import { expect, test } from "bun:test";
import type { JobsClock } from "../jobs";
import { startLangflowLifecycle } from "./langflowLifecycle";
import type { LangflowConnection, LangflowConnections } from "./types";

test("shutdown aborts domain calls and waits before the caller closes transport", async () => {
	const timers = new Map<number, () => unknown>();
	let nextTimer = 0;
	const clock: JobsClock = {
		now: () => new Date(),
		setTimer: (fn) => {
			const id = ++nextTimer;
			timers.set(id, fn);
			return id;
		},
		clearTimer: (id) => {
			timers.delete(id);
		},
	};
	const entered = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	const order: string[] = [];
	let signal: AbortSignal | undefined;
	const lifecycle = await startLangflowLifecycle({
		clock,
		log: () => {},
		connect: (current) => {
			signal = current;
			current.addEventListener("abort", () => order.push("abort"));
			const idle: LangflowConnection = { recover: async () => {}, committed: async () => {} };
			const connections: LangflowConnections = {
				authority: idle,
				admission: idle,
				decisions: idle,
				stops: idle,
				projection: idle,
				native: {
					recover: async () => {},
					committed: async () => {
						entered.resolve();
						await finish.promise;
						order.push("effect-finished");
					},
				},
			};
			return connections;
		},
	});
	lifecycle.committed({ domain: "native", executionId: "one" });
	await entered.promise;
	const stopping = lifecycle.stop().then(() => order.push("transport-close"));
	expect(signal?.aborted).toBe(true);
	expect(order).toEqual(["abort"]);
	expect(timers.size).toBe(0);
	finish.resolve();
	await stopping;
	expect(order).toEqual(["abort", "effect-finished", "transport-close"]);
});

test("ordinary pause leaves stops active until freeze and retains committed notices", async () => {
	const calls: string[] = [];
	const stopEntered = Promise.withResolvers<void>();
	const stopRelease = Promise.withResolvers<void>();
	const resumedNative = Promise.withResolvers<void>();
	const resumedStop = Promise.withResolvers<void>();
	const connection = (name: string): LangflowConnection => ({
		recover: async () => {
			calls.push(`${name}:recover`);
		},
		committed: async ({ executionId }) => {
			calls.push(`${name}:${executionId}`);
			if (name === "stops" && executionId === "one") {
				stopEntered.resolve();
				await stopRelease.promise;
			}
			if (name === "native") resumedNative.resolve();
			if (name === "stops" && executionId === "two") resumedStop.resolve();
		},
	});
	const lifecycle = await startLangflowLifecycle({
		clock: { now: () => new Date(), setTimer: () => 1, clearTimer: () => {} },
		log: () => {},
		connect: () => ({
			authority: connection("authority"),
			admission: connection("admission"),
			decisions: connection("decisions"),
			stops: connection("stops"),
			native: connection("native"),
			projection: connection("projection"),
		}),
	});
	const scope = await lifecycle.pauseOrdinary();
	lifecycle.committed({ domain: "native", executionId: "one" });
	lifecycle.committed({ domain: "stops", executionId: "one" });
	await stopEntered.promise;
	let frozen = false;
	const freeze = scope.freezeStops().then(() => {
		frozen = true;
	});
	await Promise.resolve();
	expect(frozen).toBe(false);
	stopRelease.resolve();
	await freeze;
	lifecycle.committed({ domain: "stops", executionId: "two" });
	expect(calls).toEqual(["stops:one"]);
	scope.resume();
	await Promise.all([resumedNative.promise, resumedStop.promise]);
	expect(calls).toContain("native:one");
	expect(calls).toContain("stops:two");
	await lifecycle.stop();
});
