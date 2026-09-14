import { expect, test } from "bun:test";
import { processCompletion } from "./processCompletion";

test("leader exit waits for cleanup and output close", async () => {
	const cleanup = Promise.withResolvers<void>();
	const exits: (number | null)[] = [];
	const lifecycle = processCompletion(
		() => cleanup.promise,
		(code) => exits.push(code),
		() => {},
	);
	lifecycle.leaderExited(0);
	cleanup.resolve();
	await cleanup.promise;
	expect(exits).toEqual([]);
	lifecycle.closed(0);
	expect(exits).toEqual([0]);
});
test("closed streams cannot confirm a process whose cleanup failed", async () => {
	const cleanup = Promise.withResolvers<void>();
	const exits: (number | null)[] = [];
	const errors: string[] = [];
	const lifecycle = processCompletion(
		() => cleanup.promise,
		(code) => exits.push(code),
		(error) => errors.push(error.message),
	);
	lifecycle.closed(0);
	cleanup.reject(new Error("Unconfirmed group"));
	await Promise.resolve();
	lifecycle.closed(0);
	expect(exits).toEqual([]);
	expect(errors).toEqual(["Unconfirmed group"]);
});
test("stop and exit share one cleanup", async () => {
	let calls = 0;
	const exits: (number | null)[] = [];
	const lifecycle = processCompletion(
		async () => {
			calls++;
		},
		(code) => exits.push(code),
		() => {},
	);
	lifecycle.stop();
	lifecycle.leaderExited(null);
	lifecycle.closed(null);
	await Promise.resolve();
	expect(calls).toBe(1);
	expect(exits).toEqual([null]);
});
