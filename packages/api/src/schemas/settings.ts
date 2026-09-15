import { z } from "zod";

export const SettingsSchema = z.object({
	defaultActorName: z.string().max(64),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsSetInputSchema = z.strictObject(SettingsSchema.shape);
export type SettingsSetInput = z.input<typeof SettingsSetInputSchema>;
