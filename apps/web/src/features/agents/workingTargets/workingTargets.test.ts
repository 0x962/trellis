import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { workingTargets } from "./workingTargets";

const run = {
	id: "run",
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

test("ticket activity follows every assigned worker, project activity follows its manager, and every working run is listed", () => {
	expect(
		workingTargets([
			run,
			{ ...run, id: "reviewer", kind: "reviewer" },
			{ ...run, id: "manager", kind: "manager", ticketId: null },
		]),
	).toEqual({
		ticketIds: ["ticket"],
		projectIds: ["project"],
		runIds: ["run", "reviewer", "manager"],
	});
	expect(workingTargets([run])).toEqual({ ticketIds: ["ticket"], projectIds: [], runIds: ["run"] });
	expect(workingTargets([])).toEqual({ ticketIds: [], projectIds: [], runIds: [] });
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
	] satisfies Pick<AgentRun, "id" | "kind" | "projectId" | "ticketId" | "processStatus" | "observation">[];
	expect(workingTargets(inactive)).toEqual({ ticketIds: [], projectIds: [], runIds: [] });
	expect(workingTargets([...inactive, { ...run, ticketId: "other" }])).toEqual({
		ticketIds: ["other"],
		projectIds: [],
		runIds: ["run"],
	});
});
