import type { LaunchRun } from "../../services/agentRuns/types.ts";

export const launchPrompt = (input: { run: LaunchRun; messageId?: string }) => {
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	return `${prefix}${input.run.instruction}`;
};
