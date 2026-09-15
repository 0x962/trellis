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

test("an explicit stop can repeat failed cleanup and waits for stream closure", async () => {
	let calls = 0;
	const second = Promise.withResolvers<void>();
	const errors: string[] = [];
	const exits: (number | null)[] = [];
	const lifecycle = processCompletion(
		() => (++calls === 1 ? Promise.reject(new Error("spawnSync /bin/ps ETIMEDOUT")) : second.promise),
		(code) => exits.push(code),
		(error) => errors.push(error.message),
	);
	lifecycle.stop();
	await Promise.resolve();
	expect(errors).toEqual(["spawnSync /bin/ps ETIMEDOUT"]);
	lifecycle.stop();
	expect(calls).toBe(2);
	second.resolve();
	await second.promise;
	expect(exits).toEqual([]);
	lifecycle.closed(null);
	expect(exits).toEqual([null]);
});

test("natural PTY exit confirms cleanup after an earlier stop failed", async () => {
	let calls = 0;
	const exits: (number | null)[] = [];
	const errors: string[] = [];
	const lifecycle = processCompletion(
		async () => {
			calls++;
			if (calls === 1) throw new Error("spawnSync /bin/ps ETIMEDOUT");
		},
		(code) => exits.push(code),
		(error) => errors.push(error.message),
	);
	lifecycle.stop();
	await Promise.resolve();
	expect(errors).toEqual(["spawnSync /bin/ps ETIMEDOUT"]);
	lifecycle.closed(0);
	await Promise.resolve();
	expect(calls).toBe(2);
	expect(exits).toEqual([0]);
});

test("natural leader exit after failed stop waits for output closure", async () => {
	let calls = 0;
	const exits: (number | null)[] = [];
	const lifecycle = processCompletion(
		async () => {
			if (++calls === 1) throw new Error("Cleanup failed");
		},
		(code) => exits.push(code),
		() => {},
	);
	lifecycle.stop();
	await Promise.resolve();
	lifecycle.leaderExited(3);
	await Promise.resolve();
	expect(calls).toBe(2);
	expect(exits).toEqual([]);
	lifecycle.closed(3);
	expect(exits).toEqual([3]);
});

test("duplicate natural exit events do not repeat failed cleanup", async () => {
	let calls = 0;
	const errors: string[] = [];
	const lifecycle = processCompletion(
		async () => {
			calls++;
			throw new Error("Cleanup failed");
		},
		() => {},
		(error) => errors.push(error.message),
	);
	lifecycle.stop();
	await Promise.resolve();
	lifecycle.leaderExited(0);
	await Promise.resolve();
	lifecycle.leaderExited(0);
	lifecycle.closed(0);
	await Promise.resolve();
	lifecycle.closed(0);
	await Promise.resolve();
	expect(calls).toBe(3);
	expect(errors).toHaveLength(3);
});

test("each explicit stop can repeat a failed cleanup attempt", async () => {
	let calls = 0;
	const exits: (number | null)[] = [];
	const lifecycle = processCompletion(
		async () => {
			if (++calls < 3) throw new Error("Cleanup failed");
		},
		(code) => exits.push(code),
		() => {},
	);
	lifecycle.stop();
	lifecycle.stop();
	await Promise.resolve();
	expect(calls).toBe(1);
	lifecycle.stop();
	await Promise.resolve();
	lifecycle.stop();
	lifecycle.closed(0);
	await Promise.resolve();
	expect(calls).toBe(3);
	expect(exits).toEqual([0]);
});
