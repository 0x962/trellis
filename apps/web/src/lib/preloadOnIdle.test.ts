import { describe, expect, test } from "bun:test";
import { preloadOnIdle } from "./preloadOnIdle";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("lib/preloadOnIdle", () => {
	test("runs the load after the current task and not during the call", async () => {
		let calls = 0;
		preloadOnIdle(async () => {
			calls += 1;
		});
		expect(calls).toBe(0);
		await wait(100);
		expect(calls).toBe(1);
	});

	test("the returned function stops a load that has not run", async () => {
		let calls = 0;
		const cancel = preloadOnIdle(async () => {
			calls += 1;
		});
		cancel();
		await wait(100);
		expect(calls).toBe(0);
	});
});
