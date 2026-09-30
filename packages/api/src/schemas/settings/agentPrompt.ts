import { z } from "zod";

export const AgentPromptSettingsSchema = z.object({
	template: z.string(),
	defaultTemplate: z.string(),
	variables: z.array(z.string()),
	isCustom: z.boolean(),
});
export type AgentPromptSettings = z.infer<typeof AgentPromptSettingsSchema>;

export const AgentPromptSetInputSchema = z.strictObject({
	template: z.string().nullable(),
	expectedTemplate: z.string(),
});
export type AgentPromptSetInput = z.infer<typeof AgentPromptSetInputSchema>;
