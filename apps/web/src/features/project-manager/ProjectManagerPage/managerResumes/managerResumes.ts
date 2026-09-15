import type { AgentRun } from "@trellis/api";

export const managerResumes = (run: Pick<AgentRun, "runtime" | "sessionId" | "workspaceId"> | undefined) =>
	run !== undefined && run.runtime === "native" && run.sessionId !== null && run.workspaceId !== null;
