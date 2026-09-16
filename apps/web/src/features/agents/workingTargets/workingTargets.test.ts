import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { workingTargets } from "./workingTargets";

const run = {
	kind: "builder",
	projectId: "project",
	ticketId: "ticket",
	processStatus: "running",
	observation: {
		controllable: true,
		activity: { state: "working", updatedAt: "now" },
		outcome: null,
		checkedAt: "now",
		turnId: "turn",
	},
} satisfies Parameters<typeof workingTargets>[0][number];

test("ticket activity follows every assigned worker and project activity follows its manager", () => {
	expect(workingTargets([run, { ...run, kind: "reviewer" }, { ...run, kind: "manager", ticketId: null }])).toEqual({
		ticketIds: ["ticket"],
		projectIds: ["project"],
	});
	expect(workingTargets([run])).toEqual({ ticketIds: ["ticket"], projectIds: [] });
	expect(workingTargets([])).toEqual({ ticketIds: [], projectIds: [] });
});

test("idle, ready, completed, stopped, and unknown processes do not mark their targets as working", () => {
	const inactive = [
		...(["idle", "ready"] as const).map((state) => ({
			...run,
			observation: { ...run.observation, activity: { state, updatedAt: "now" } },
		})),
		...(["completed", "failed", "interrupted"] as const).map((outcome) => ({
			...run,
			observation: { ...run.observation, outcome },
		})),
		...(["exited", "unknown", null] as const).map((processStatus) => ({ ...run, processStatus })),
		{ ...run, observation: null },
		{ ...run, observation: { ...run.observation, controllable: false } },
	] satisfies Pick<AgentRun, "kind" | "projectId" | "ticketId" | "processStatus" | "observation">[];
	expect(workingTargets(inactive)).toEqual({ ticketIds: [], projectIds: [] });
	expect(workingTargets([...inactive, { ...run, ticketId: "other" }])).toEqual({
		ticketIds: ["other"],
		projectIds: [],
	});
});
