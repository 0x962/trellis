import {
	AgentPromptSetInputSchema,
	AgentPromptSettingsSchema,
	SettingsSchema,
	SettingsSetInputSchema,
} from "../schemas/settings/index.ts";
import { base } from "./base.ts";

export const settings = {
	agentPrompt: base
		.route({ method: "GET", path: "/settings/agent-prompt", summary: "Read the startup prompt" })
		.output(AgentPromptSettingsSchema),
	setAgentPrompt: base
		.route({ method: "PUT", path: "/settings/agent-prompt", summary: "Save the startup prompt" })
		.input(AgentPromptSetInputSchema)
		.output(AgentPromptSettingsSchema),
	get: base.route({ method: "GET", path: "/settings", summary: "Read the settings" }).output(SettingsSchema),
	set: base
		.route({ method: "PATCH", path: "/settings", summary: "Update the settings" })
		.input(SettingsSetInputSchema)
		.output(SettingsSchema),
};
