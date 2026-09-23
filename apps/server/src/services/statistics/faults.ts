import type { AgentRun, StatisticsFault, StatisticsFaultKind } from "@trellis/api";
import type { FaultGroup } from "../../db/queries/statisticsFaults.ts";

// The ticket assignments whose agent process is gone. `interrupted` means
// the execution service holds no record of the attempt. `failed` means the
// attempt ended with an error. The run row keeps no moment for either one,
// so the age of this fault is the age of the assignment.
export const deadRuns = (runs: readonly AgentRun[]) =>
	runs.filter((run) => run.kind === "agent" && run.assigned && (run.state === "interrupted" || run.state === "failed"));

const runFault = (runs: readonly AgentRun[]): StatisticsFault[] => {
	const oldest = runs.reduce<AgentRun | null>(
		(first, run) => (first === null || run.createdAt < first.createdAt ? run : first),
		null,
	);
	if (oldest === null) return [];
	return [
		{
			kind: "agentRunDead",
			count: runs.length,
			oldest: { identifier: oldest.ticketIdentifier, title: oldest.ticketTitle, since: oldest.createdAt },
		},
	];
};

const groupFaults = (groups: readonly FaultGroup[], kinds: Record<string, StatisticsFaultKind>): StatisticsFault[] =>
	groups.map((group) => ({
		kind: kinds[group.key]!,
		count: group.count,
		oldest: { identifier: group.identifier, title: group.title, since: group.since },
	}));

// Every fault that holds at least one case, oldest case first. A fault with
// no case reaches no row, and a page with no fault at all says that the
// machine holds nothing.
export const faults = (
	runs: readonly AgentRun[],
	messages: readonly FaultGroup[],
	flowRuns: readonly FaultGroup[],
): StatisticsFault[] =>
	[
		...runFault(deadRuns(runs)),
		...groupFaults(messages, { failed: "reviewMessageFailed", held: "reviewMessageHeld" }),
		...groupFaults(flowRuns, { waiting: "flowRunWaiting", running: "flowRunRunning" }),
	].sort((a, b) => (a.oldest.since < b.oldest.since ? -1 : a.oldest.since > b.oldest.since ? 1 : 0));
