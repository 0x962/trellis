import { z } from "zod";

// `startWithAgentTemplate` is the command the Start-with-agent button copies;
// `{brief}` in it stands for the ticket brief. `stalledHours` is how long a
// started ticket may sit without activity before Needs you lists it.
export const SettingsSchema = z.object({
	startWithAgentTemplate: z.string(),
	defaultActorName: z.string().max(64),
	stalledHours: z.number().positive(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsSetInputSchema = z.strictObject(SettingsSchema.shape);
export type SettingsSetInput = z.input<typeof SettingsSetInputSchema>;
