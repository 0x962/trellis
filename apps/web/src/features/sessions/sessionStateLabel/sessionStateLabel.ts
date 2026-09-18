import type { AgentRun } from "@trellis/api";
import { isAgentWorking } from "../../agents/isAgentWorking";

export function sessionStateLabel(run: AgentRun) {
	if (isAgentWorking(run)) return "Working";
	return {
		running: "Running",
		exited: "Stopped",
		stopped: "Stopped",
		failed: "Failed",
		starting: "Starting",
		interrupted: "Interrupted",
	}[run.state];
}
