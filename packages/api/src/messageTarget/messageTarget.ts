import type { AgentRun } from "../schemas/agentRun.ts";

// True while the native process of a run lives, or while the execution
// service has not reported it yet.
export const hasAssignedProcess = (run: Pick<AgentRun, "runtime" | "terminalId" | "processStatus">) =>
	run.runtime === "native" &&
	run.terminalId !== null &&
	(run.processStatus === "running" || run.processStatus === "unknown");

// The run of a ticket that a follow-up message reaches: its assigned agent
// run while the process lives. `agentRuns.send` takes the id of this run.
export const messageTarget = <
	Run extends Pick<AgentRun, "kind" | "assigned" | "runtime" | "terminalId" | "processStatus">,
>(
	runs: readonly Run[],
): Run | null => runs.find((run) => run.kind === "agent" && run.assigned && hasAssignedProcess(run)) ?? null;
