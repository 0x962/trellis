import { z } from "zod";

import { AGENT_COMMAND_VARIABLES } from "../agentLaunch/agentLaunch.ts";

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
