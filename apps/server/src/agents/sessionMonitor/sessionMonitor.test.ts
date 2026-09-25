import { expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { session } from "../../../../../packages/api/src/sessionStatus/fixture.ts";
import { projectRun } from "../../services/agentRuns/liveState.ts";
import { startSessionMonitor } from "./sessionMonitor.ts";

test("the monitor emits changed states, suppresses startup alerts, and closes subscriptions", async () => {
	const value = { run: session().run, sessionId: "session" };
	let reads = 0;
	let aborted = false;
	const emitted: TrellisEvent[] = [];
	const completed: Array<{ sessionId: string; runId: string; agentResponse: string }> = [];
	let deliver!: (value: RuntimeProcessStatus) => void;
	const next = new Promise<RuntimeProcessStatus>((resolve) => {
		deliver = resolve;
	});
	const monitor = startSessionMonitor({
		read: async () => {
			reads++;
			return [structuredClone(value)];
		},
		client: {
			subscribeSession: async function* (_id, signal) {
				const ended = new Promise<undefined>((resolve) =>
					signal!.addEventListener(
						"abort",
						() => {
							aborted = true;
							resolve(undefined);
						},
						{ once: true },
					),
				);
				const process = await Promise.race([next, ended]);
				if (process) yield { type: "session" as const, session: process };
				await ended;
			},
		},
		emit: (event) => emitted.push(event),
		complete: async (input) => {
			completed.push(input);
		},
		log: () => {},
	});
	await monitor.tick();
	expect(reads).toBe(1);
	expect(emitted).toHaveLength(1);
	expect(emitted[0]).toMatchObject({ type: "agent-runs.status", notify: false });
	await monitor.tick();
	expect(emitted).toHaveLength(1);
	deliver({
		id: "attempt",
		checkedAt: "2026-09-18T12:00:01.000Z",
		status: "running",
		controllable: true,
		error: null,
		acknowledgedMessageIds: ["attempt"],
		activity: { state: "idle" },
		agent: {
			outcome: "completed",
			turnId: "turn",
			attention: {
				sequence: 2,
				completion: { sequence: 2, at: "2026-09-18T12:00:01.000Z" },
				failure: null,
				requests: [],
			},
			lastMessage: { text: "First response", at: "2026-09-18T12:00:01.000Z" },
		},
	} as unknown as RuntimeProcessStatus);
	await Bun.sleep(0);
	expect(emitted.at(-1)).toMatchObject({
		type: "agent-runs.status",
		notify: true,
		activity: { run: { observation: { outcome: "completed" } } },
	});
	expect(completed).toEqual([{ sessionId: "session", runId: value.run.id, agentResponse: "First response" }]);
	const count = emitted.length;
	await monitor.tick();
	expect(emitted).toHaveLength(count);
	await monitor.stop();
	expect(aborted).toBe(true);
});

test("a completed runtime event requests a name after a poll observed the same response", async () => {
	const process = {
		id: "attempt",
		checkedAt: "2026-09-18T12:00:01.000Z",
		status: "running",
		controllable: true,
		error: null,
		acknowledgedMessageIds: ["attempt"],
		activity: { state: "idle" },
		agent: {
			outcome: "completed",
			turnId: "turn",
			attention: {
				sequence: 2,
				completion: { sequence: 2, at: "2026-09-18T12:00:01.000Z" },
				failure: null,
				requests: [],
			},
			lastMessage: { text: "First response", at: "2026-09-18T12:00:01.000Z" },
		},
	} as unknown as RuntimeProcessStatus;
	const base = session().run;
	const value = {
		run: projectRun({ ...base, closedAt: null }, [process]),
		sessionId: "session",
	};
	const emitted: TrellisEvent[] = [];
	const completed: Array<{ sessionId: string; runId: string; agentResponse: string }> = [];
	const monitor = startSessionMonitor({
		read: async () => [structuredClone(value)],
		client: {
			subscribeSession: async function* () {
				yield { type: "session" as const, session: process };
			},
		},
		emit: (event) => emitted.push(event),
		complete: async (input) => {
			completed.push(input);
		},
		log: () => {},
	});

	await monitor.tick();
	await Bun.sleep(0);
	expect(emitted).toHaveLength(1);
	expect(completed).toEqual([{ sessionId: "session", runId: value.run.id, agentResponse: "First response" }]);
	await monitor.stop();
});

test("the monitor emits when the last message or the shown tool changes, and not for tool output", async () => {
	const value = { run: session().run, sessionId: "session" };
	value.run.processStatus = "exited";
	const emitted: TrellisEvent[] = [];
	const completed: Array<{ sessionId: string; runId: string; agentResponse: string }> = [];
	const monitor = startSessionMonitor({
		read: async () => [structuredClone(value)],
		client: {
			subscribeSession: async function* () {},
		},
		emit: (event) => emitted.push(event),
		complete: async (input) => {
			completed.push(input);
		},
		log: () => {},
	});

	await monitor.tick();
	value.run.observation!.outcome = "completed";
	value.run.observation!.lastMessage = { text: "First message", at: "2026-09-18T12:00:01.000Z" };
	await monitor.tick();
	expect(emitted).toHaveLength(2);
	expect(completed).toEqual([]);

	value.run.observation!.lastMessage = { text: "Changed text", at: "2026-09-18T12:00:01.000Z" };
	await monitor.tick();
	expect(emitted).toHaveLength(2);

	value.run.observation!.lastMessage.at = "2026-09-18T12:00:02.000Z";
	await monitor.tick();
	expect(emitted).toHaveLength(3);

	value.run.observation!.lastTool = {
		name: "Read",
		target: "apps/web/src/app.css",
		targetKind: "code",
		status: "running",
		startedAt: "2026-09-18T12:00:03.000Z",
		updatedAt: "2026-09-18T12:00:03.000Z",
	};
	await monitor.tick();
	expect(emitted).toHaveLength(4);

	value.run.observation!.lastTool.updatedAt = "2026-09-18T12:00:04.000Z";
	await monitor.tick();
	expect(emitted).toHaveLength(4);

	value.run.observation!.lastTool.status = "completed";
	await monitor.tick();
	expect(emitted).toHaveLength(5);
	await monitor.stop();
});
