import { z } from "zod";
import { BackupOutputSchema, GhStatusSchema, HealthSchema } from "../schemas/system.ts";
import { base } from "./base.ts";

export const system = {
	chooseDirectory: base
		.route({ method: "POST", path: "/choose-directory", summary: "Select a directory on the server computer" })
		.output(z.string().nullable()),
	health: base.route({ method: "GET", path: "/health", summary: "Read server health" }).output(HealthSchema),
	gh: base.route({ method: "GET", path: "/gh", summary: "Read the gh state" }).output(GhStatusSchema),
	backup: base
		.route({ method: "POST", path: "/backup", summary: "Write a backup archive under the data home" })
		.output(BackupOutputSchema),
};
