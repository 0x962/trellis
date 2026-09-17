import type { AgentRun } from "@trellis/api";

export function isAgentWorking(run: Pick<AgentRun, "processStatus" | "observation">) {
	return (
		run.processStatus === "running" &&
		run.observation?.controllable === true &&
		run.observation.activity?.state === "working" &&
		run.observation.outcome === null
	);
}
