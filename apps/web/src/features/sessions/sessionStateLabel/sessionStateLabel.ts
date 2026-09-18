import { type AgentRun, sessionStatus, sessionStatusLabels } from "@trellis/api";

export function sessionStateLabel(run: AgentRun) {
	return sessionStatusLabels[sessionStatus(run)];
}
