import type { AgentRun } from "@trellis/api";
import { hasAssignedProcess } from "../../../../agents/hasAssignedProcess";

export type AssignedAgentTab = {
	value: `agent:${string}`;
	label: string;
	run: AgentRun;
};

export function assignedAgentTabs(runs: AgentRun[]): AssignedAgentTab[] {
	const assigned = runs.filter(hasAssignedProcess);
	const totals = new Map<string, number>();
	for (const run of assigned) totals.set(run.personaName, (totals.get(run.personaName) ?? 0) + 1);
	const positions = new Map<string, number>();
	return assigned.map((run) => {
		const position = (positions.get(run.personaName) ?? 0) + 1;
		positions.set(run.personaName, position);
		return {
			value: `agent:${run.id}`,
			label: totals.get(run.personaName) === 1 ? run.personaName : `${run.personaName} ${position}`,
			run,
		};
	});
}
