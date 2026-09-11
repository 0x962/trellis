import { z } from "zod";
import { hasStandaloneLaunchHyphen, unknownLaunchVariables } from "../agentLaunch/agentLaunch.ts";

// `stalledHours` is how long a started ticket may sit without activity
// before Needs you lists it.
// `diffUrlTemplate` is the address the Show diff control of a pull request
// opens; `{url}` in it stands for the URL of the pull request.
export const SettingsSchema = z.object({
	defaultActorName: z.string().max(64),
	stalledHours: z.number().positive(),
	diffUrlTemplate: z.string(),
	agentLaunchCommand: z
		.string()
		.trim()
		.min(1)
		.max(20000)
		.refine((value) => unknownLaunchVariables(value).length === 0, "The command has an unknown template variable.")
		.refine(
			(value) => !hasStandaloneLaunchHyphen(value),
			"Remove the standalone hyphen. Superset reads it as an unknown option.",
		)
		.optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsSetInputSchema = z.strictObject(SettingsSchema.shape);
export type SettingsSetInput = z.input<typeof SettingsSetInputSchema>;
