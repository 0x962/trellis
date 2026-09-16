import { expect, test } from "bun:test";
import { dispatch } from "../../../../../src/services/controller/dispatch.ts";

const context = {} as Parameters<typeof dispatch>[0];
const done = async () => {};

test("a slow builder launch does not delay manager dispatch", async () => {
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
			chat: done,
			managers: async () => {
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

test("a failed heartbeat still dispatches managers and reports its error", async () => {
	let managers = 0;
	await expect(
		dispatch(
			context,
			{},
			{
				readSessions: async () => [],
				mentions: done,
				chat: done,
				manage: async () => {
					throw new Error("Failed heartbeat");
				},
				managers: async () => {
					managers++;
				},
			},
		),
	).rejects.toThrow("Failed heartbeat");
	expect(managers).toBe(1);
});
