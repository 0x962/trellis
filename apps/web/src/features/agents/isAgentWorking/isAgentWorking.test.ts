import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { isAgentWorking } from "./isAgentWorking";

const working = {
	processStatus: "running",
	observation: {
		controllable: true,
		activity: { state: "working", updatedAt: "now" },
		outcome: null,
		checkedAt: "now",
		turnId: "turn",
	},
} satisfies Pick<AgentRun, "processStatus" | "observation">;

test("only a controllable process with an unfinished working turn animates", () => {
	expect(isAgentWorking(working)).toBe(true);
	for (const processStatus of ["exited", "unknown", null] as const) {
		expect(isAgentWorking({ ...working, processStatus })).toBe(false);
	}
	expect(isAgentWorking({ ...working, observation: null })).toBe(false);
	expect(isAgentWorking({ ...working, observation: { ...working.observation, controllable: false } })).toBe(false);
	for (const state of ["ready", "idle"] as const) {
		expect(
			isAgentWorking({ ...working, observation: { ...working.observation, activity: { state, updatedAt: "now" } } }),
		).toBe(false);
	}
	for (const outcome of ["completed", "interrupted", "failed"] as const) {
		expect(isAgentWorking({ ...working, observation: { ...working.observation, outcome } })).toBe(false);
	}
	expect(isAgentWorking({ ...working, observation: { ...working.observation, activity: null } })).toBe(false);
});
