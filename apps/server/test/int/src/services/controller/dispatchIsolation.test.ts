import { expect, test } from "bun:test";
import { beginHostShutdown } from "../../../../../src/services/agentRuns/hostShutdown.ts";
import { dispatch } from "../../../../../src/services/controller/dispatch.ts";

const context = { home: "/dispatch-active" } as unknown as Parameters<typeof dispatch>[0];
const done = async () => {};

test("a slow builder launch does not delay user chat", async () => {
	let finishLaunch!: () => void;
	const launch = new Promise<void>((resolve) => {
		finishLaunch = resolve;
	});
	let sawManager!: () => void;
	const manager = new Promise<string>((resolve) => {
		sawManager = () => resolve("manager");
	});
	const work = dispatch(
		context,
		{},
		{
			readSessions: async () => [],
			manage: () => launch,
			mentions: done,
			chat: async () => {
				sawManager();
			},
		},
	);
	const observed = await Promise.race([
		manager,
		work.then(
			() => "completed",
			() => "failed",
		),
	]);
	finishLaunch();
	await work;
	expect(observed).toBe("manager");
});

test("a failed heartbeat still dispatches user chat and reports its error", async () => {
	let managers = 0;
	await expect(
		dispatch(
			context,
			{},
			{
				readSessions: async () => [],
				mentions: done,
				manage: async () => {
					throw new Error("Failed heartbeat");
				},
				chat: async () => {
					managers++;
				},
			},
		),
	).rejects.toThrow("Failed heartbeat");
	expect(managers).toBe(1);
});

test("host shutdown prevents runtime recovery", async () => {
	let reads = 0;
	beginHostShutdown("/dispatch-shutdown");
	const paused = { home: "/dispatch-shutdown" } as unknown as Parameters<typeof dispatch>[0];
	await dispatch(
		paused,
		{},
		{
			readSessions: async () => {
				reads++;
				return [];
			},
			manage: done,
			mentions: done,
			chat: done,
		},
	);
	expect(reads).toBe(0);
});
