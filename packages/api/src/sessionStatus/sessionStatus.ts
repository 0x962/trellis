import { hasAssignedProcess } from "../messageTarget/messageTarget.ts";
import type { AgentRun } from "../schemas/agentRun.ts";

export type SessionStatus =
	| "starting"
	| "working"
	| "needs-input"
	| "done"
	| "idle"
	| "paused"
	| "failed"
	| "interrupted"
	| "unavailable";
export function sessionStatus(run: AgentRun): SessionStatus {
	const status = processStatus(run);
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

function processStatus(run: AgentRun): SessionStatus {
	if (run.state === "starting") return "starting";
	if (run.state === "failed") return "failed";
	if (run.state === "stopped") return "idle";
	if (run.processStatus === "exited") return "idle";
	if (run.processStatus === "unknown" || run.observation === null) return "unavailable";
	const attention = run.observation.attention;
	if (run.processStatus === "running" && run.observation.controllable && attention?.requests.length)
		return "needs-input";
	if (run.observation.outcome === "failed") return "failed";
	if (run.observation.outcome === "interrupted") return "interrupted";
	const seen = run.seenAttention?.attemptId === run.terminalId ? run.seenAttention.sequence : 0;
	if (attention?.completion && attention.completion.sequence > seen) return "done";
	if (!run.observation.controllable) return "unavailable";
	if (run.observation.activity?.state === "working" && run.observation.outcome === null) return "working";
	return "idle";
}
export const sessionStatusLabels: Record<SessionStatus, string> = {
	starting: "Starting",
	working: "Working",
	"needs-input": "Needs input",
	done: "Done",
	idle: "Idle",
	failed: "Failed",
	interrupted: "Interrupted",
	paused: "Paused",
	unavailable: "Unavailable",
};
