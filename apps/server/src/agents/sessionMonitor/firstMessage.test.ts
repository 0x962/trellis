import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { session } from "../../../../../packages/api/src/sessionStatus/fixture.ts";
import { startSessionMonitor } from "./sessionMonitor.ts";

const working = (): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "runtime",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-18T12:00:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 1,
	checkedAt: "2026-09-18T12:00:01.000Z",
	controllable: true,
	process: null,
	launch: null,
	acknowledgedMessageIds: [],
	activity: { state: "working", updatedAt: "2026-09-18T12:00:01.000Z" },
	agent: {
		sessionId: "conversation",
		model: null,
		turnId: "turn",
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: null,
		outcome: null,
	},
	result: null,
});

test.each([null, "project"])("the first prompt starts naming before a reply for project %s", async (projectId) => {
	const value = { run: { ...session().run, projectId }, sessionId: "session" };
	const requested: unknown[] = [];
	let acknowledge!: () => void;
	const acknowledged = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	const monitor = startSessionMonitor({
		read: async () => [structuredClone(value)],
		record: async () => {},
		client: {
			subscribeSession: async function* (_id, signal) {
				const stopped = new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve()));
				yield { type: "session", session: { ...working(), acknowledgedMessageIds: ["other-message"] } };
				await acknowledged;
				yield { type: "session", session: { ...working(), acknowledgedMessageIds: ["attempt"] } };
				yield { type: "session", session: { ...working(), acknowledgedMessageIds: ["attempt"] } };
				await stopped;
			},
		},
		emit: () => {},
		nameSession: async (input) => {
			requested.push(input);
		},
		log: () => {},
	});
	try {
		await monitor.tick();
		await Bun.sleep(0);
		expect(requested).toEqual([]);
		acknowledge();
		await Bun.sleep(0);
		expect(requested).toEqual([{ sessionId: "session", runId: value.run.id }]);
	} finally {
		acknowledge();
		await monitor.stop();
	}
});

test("a resumed attempt keeps the first name request", async () => {
	const value = { run: session().run, sessionId: "session" };
	const requested: unknown[] = [];
	const monitor = startSessionMonitor({
		read: async () => [structuredClone(value)],
		record: async () => {},
		client: {
			subscribeSession: async function* (id, signal) {
				const stopped = new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve()));
				yield { type: "session", session: { ...working(), id, acknowledgedMessageIds: [id] } };
				await stopped;
			},
		},
		emit: () => {},
		nameSession: async (input) => {
			requested.push(input);
		},
		log: () => {},
	});
	try {
		await monitor.tick();
		await Bun.sleep(0);
		value.run.terminalId = "resumed-attempt";
		await monitor.tick();
		await Bun.sleep(0);
		expect(requested).toEqual([{ sessionId: "session", runId: value.run.id }]);
	} finally {
		await monitor.stop();
	}
});

test("a ticket agent prompt does not request a session name", async () => {
	const requested: unknown[] = [];
	const monitor = startSessionMonitor({
		read: async () => [{ run: session().run, sessionId: null }],
		record: async () => {},
		client: {
			subscribeSession: async function* () {
				yield { type: "session", session: { ...working(), acknowledgedMessageIds: ["attempt"] } };
			},
		},
		emit: () => {},
		nameSession: async (input) => {
			requested.push(input);
		},
		log: () => {},
	});
	try {
		await monitor.tick();
		await Bun.sleep(0);
		expect(requested).toEqual([]);
	} finally {
		await monitor.stop();
	}
});
