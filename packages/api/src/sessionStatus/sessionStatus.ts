import type { AgentRun } from "../schemas/agentRun.ts";

export type SessionStatus =
	| "starting"
	| "working"
	| "needs-input"
	| "done"
	| "idle"
	| "failed"
	| "interrupted"
	| "unavailable";
export function sessionStatus(run: AgentRun): SessionStatus {
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
	unavailable: "Unavailable",
};
