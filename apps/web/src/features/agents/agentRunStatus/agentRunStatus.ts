import { type AgentRun, hasAssignedProcess, type SessionStatus, sessionStatus } from "@trellis/api";

export function agentRunStatus(run: AgentRun): SessionStatus | "paused" {
	const status = sessionStatus(run);
	if (
		status !== "idle" ||
		!run.assigned ||
		run.kind !== "agent" ||
		run.ticketId === null ||
		run.runtime !== "native" ||
		hasAssignedProcess(run) ||
		run.error !== null
	)
		return status;
	if (run.ticketStatusCategory === "done" || run.observation?.outcome === "completed") return "done";
	if (run.ticketStatusCategory === "canceled" || run.observation?.outcome != null) return status;
	if (run.state === "stopped" || run.state === "exited" || run.processStatus === "exited") return "paused";
	return status;
}
