import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { workerAction } from "./workerAction.ts";

const now = new Date("2026-09-17T02:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const live = {
	status: "running",
	controllable: true,
	startedAt: ago(0),
	agent: { error: null, outcome: null },
	activity: { state: "working" },
} as RuntimeProcessStatus;
test("healthy workers continue without a restart", () => {
	expect(workerAction(live, now)).toBe("keep");
});
test("a failed turn restarts even while its process is alive", () => {
	expect(workerAction({ ...live, agent: { ...live.agent!, outcome: "failed" } }, now)).toBe("restart");
});
test("quota errors restart even without a failed outcome", () => {
	expect(workerAction({ ...live, agent: { ...live.agent!, error: "quota exceeded" } }, now)).toBe("restart");
});
test("stopped and crashed processes restart on every beat", () => {
	const exited = { ...live, status: "exited" } as RuntimeProcessStatus;
	expect(workerAction(exited, now)).toBe("restart");
	expect(workerAction(exited, now)).toBe("restart");
});
test("unknown process ownership prevents a duplicate launch", () => {
	expect(workerAction({ ...live, status: "unknown" } as RuntimeProcessStatus, now)).toBe("inspect");
});
test("an idle worker receives a continuation", () => {
	expect(workerAction({ ...live, activity: { ...live.activity!, state: "idle" } }, now)).toBe("continue");
});

test.each(["ready", "working", "idle"] as const)("a silent %s worker restarts after 60 seconds", (state) => {
	const session = {
		...live,
		startedAt: ago(120_000),
		checkedAt: ago(0),
		activity: { state, updatedAt: ago(0) },
		agent: { ...live.agent!, lastMessage: { text: "I will inspect the ticket.", at: ago(60_000) } },
	};
	expect(workerAction(session, now)).toBe("restart");
});

test("startup has exactly 60 seconds to produce activity", () => {
	const session = { ...live, agent: null, activity: null };
	expect(workerAction({ ...session, startedAt: ago(59_999) }, now)).toBe("keep");
	expect(workerAction({ ...session, startedAt: ago(60_000) }, now)).toBe("restart");
});

test("a recent assistant message keeps an old worker alive", () => {
	const session = {
		...live,
		startedAt: ago(300_000),
		agent: { ...live.agent!, lastMessage: { text: "The test passes.", at: ago(59_999) } },
	};
	expect(workerAction(session, now)).toBe("keep");
});

test.each(["running", "completed", "failed"] as const)("recent %s tool activity keeps a worker alive", (status) => {
	const session = {
		...live,
		startedAt: ago(300_000),
		agent: {
			...live.agent!,
			lastTool: {
				id: "tool",
				name: "test",
				startedAt: ago(120_000),
				updatedAt: ago(59_999),
				status,
				error: null,
			},
		},
	};
	expect(workerAction(session, now)).toBe("keep");
	expect(workerAction(session, new Date(now.getTime() + 1))).toBe("restart");
});

test("a copilot can wait for instructions without activity", () => {
	const session = {
		...live,
		startedAt: ago(300_000),
		activity: { state: "idle" as const, updatedAt: ago(300_000) },
	};
	expect(workerAction(session, now, { allowIdle: true })).toBe("continue");
	expect(workerAction({ ...session, agent: { ...live.agent!, error: "quota" } }, now, { allowIdle: true })).toBe(
		"restart",
	);
});
