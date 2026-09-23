import { type AgentRun, isAgentWorking, sessionStatus } from "@trellis/api";
import type { AgentMarkState } from "@trellis/ui";

// How the avatar of an assigned agent run draws.
//
// Trellis writes the run and answers the caller before the harness process
// exists, and `sessionStatus` calls that run `starting`. Such a run has no
// observation at all, so `isAgentWorking` is false for it and the mark would
// draw the same as the mark of an agent that sits idle. `starting` gives it
// its own reading.
export const agentMarkState = (run: AgentRun): AgentMarkState => {
	if (sessionStatus(run) === "starting") return "starting";
	return isAgentWorking(run) ? "working" : "static";
};
