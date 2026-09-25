import { SettingsSchema, SettingsSetInputSchema } from "../schemas/settings/index.ts";
import { base } from "./base.ts";

export const settings = {
	get: base.route({ method: "GET", path: "/settings", summary: "Read the settings" }).output(SettingsSchema),
	set: base
		.route({ method: "PATCH", path: "/settings", summary: "Update the settings" })
		.input(SettingsSetInputSchema)
		.output(SettingsSchema),
};
