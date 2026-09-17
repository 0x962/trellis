import type { AgentRun } from "@trellis/api";
import { isAgentWorking } from "../isAgentWorking";

type Run = Pick<AgentRun, "id" | "kind" | "projectId" | "ticketId" | "processStatus" | "observation">;

export function workingTargets(runs: Run[]) {
	const ticketIds = new Set<string>();
	const projectIds = new Set<string>();
	const runIds = new Set<string>();
	for (const run of runs) {
		if (!isAgentWorking(run)) continue;
		runIds.add(run.id);
		if (run.ticketId !== null) ticketIds.add(run.ticketId);
		if (run.kind === "manager" && run.projectId !== null) projectIds.add(run.projectId);
	}
	return { ticketIds: [...ticketIds], projectIds: [...projectIds], runIds: [...runIds] };
}
