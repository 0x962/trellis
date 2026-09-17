import { z } from "zod";

export const SettingsSchema = z.object({
	defaultActorName: z.string().max(64, "Enter a default name of 64 characters or less."),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsSetInputSchema = z.strictObject(SettingsSchema.shape);
export type SettingsSetInput = z.input<typeof SettingsSetInputSchema>;
