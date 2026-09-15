import type { AgentRun } from "@trellis/api";

export const hasAssignedProcess = (run: Pick<AgentRun, "runtime" | "terminalId" | "processStatus">) =>
	run.runtime === "native" &&
	run.terminalId !== null &&
	(run.processStatus === "running" || run.processStatus === "unknown");
