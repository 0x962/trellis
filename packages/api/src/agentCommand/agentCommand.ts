import { z } from "zod";

export const DEFAULT_AGENT_COMMAND = "claude -n {{name}} {{prompt}}";
export const DEFAULT_AGENT_RESUME_COMMAND = "claude --continue {{prompt}}";
export const AGENT_COMMAND_VARIABLES = [
	"name",
	"prompt",
	"id",
	"project",
	"ticket",
	"actor",
	"trellisUrl",
	"workspaceId",
	"terminalId",
] as const;
export const AgentCommandSchema = z
	.string()
	.trim()
	.min(1, "Enter the agent command.")
	.max(20000)
	.refine(
		(value) =>
			[...value.matchAll(/\{\{([^{}]+)\}\}/g)].every((match) =>
				(AGENT_COMMAND_VARIABLES as readonly string[]).includes(match[1]!),
			),
		"The agent command has an unknown template variable.",
	);
