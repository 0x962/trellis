import type { AgentRun } from "@trellis/api";

type GroupableRun = Pick<AgentRun, "assigned" | "ticketStatusCategory">;

export function sessionGroups<T extends GroupableRun>(runs: T[]) {
	const current: T[] = [];
	const archived: T[] = [];
	for (const run of runs) {
		if (!run.assigned || run.ticketStatusCategory === "done" || run.ticketStatusCategory === "canceled")
			archived.push(run);
		else current.push(run);
	}
	return { current, archived };
}
