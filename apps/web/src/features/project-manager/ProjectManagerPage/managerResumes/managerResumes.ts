import type { Ade, AgentRun } from "@trellis/api";

export const managerResumes = (
	run: Pick<AgentRun, "runtime" | "sessionId" | "workspaceId" | "error"> | undefined,
	ade: Ade,
) =>
	run !== undefined &&
	(ade !== "native" || run.runtime === "native") &&
	!run.error?.startsWith("External assignment retired by") &&
	run.sessionId !== null &&
	run.workspaceId !== null;
