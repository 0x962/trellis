import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { workerAction } from "./workerAction.ts";

const live = {
	status: "running",
	controllable: true,
	agent: { error: null, outcome: null },
	activity: { state: "working" },
} as RuntimeProcessStatus;
test("healthy workers continue without a restart", () => {
	expect(workerAction(live)).toBe("keep");
});
test("a failed turn restarts even while its process is alive", () => {
	expect(workerAction({ ...live, agent: { ...live.agent!, outcome: "failed" } })).toBe("restart");
});
test("quota errors restart even without a failed outcome", () => {
	expect(workerAction({ ...live, agent: { ...live.agent!, error: "quota exceeded" } })).toBe("restart");
});
test("stopped and crashed processes restart on every beat", () => {
	const exited = { ...live, status: "exited" } as RuntimeProcessStatus;
	expect(workerAction(exited)).toBe("restart");
	expect(workerAction(exited)).toBe("restart");
});
test("unknown process ownership prevents a duplicate launch", () => {
	expect(workerAction({ ...live, status: "unknown" } as RuntimeProcessStatus)).toBe("inspect");
});
test("an idle worker receives a continuation", () => {
	expect(workerAction({ ...live, activity: { ...live.activity!, state: "idle" } })).toBe("continue");
});
