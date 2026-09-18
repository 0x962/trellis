import type { AgentRun } from "@trellis/api";

export const launchPrompt = (input: {
	run: Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation">;
	messageId?: string;
}) => {
	const prefix = input.messageId ? `trellis-message:${input.messageId}\n` : "";
	return `${prefix}${input.run.instruction}`;
};
