import { SettingsSchema, SettingsSetInputSchema } from "../schemas/settings.ts";
import { base } from "./base.ts";

export const settings = {
	get: base.route({ method: "GET", path: "/settings", summary: "Read the settings" }).output(SettingsSchema),
	set: base
		.route({ method: "PUT", path: "/settings", summary: "Replace the settings" })
		.input(SettingsSetInputSchema)
		.output(SettingsSchema),
};
