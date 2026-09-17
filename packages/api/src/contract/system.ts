import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { DiagnosticsSchema } from "../schemas/diagnostics.ts";
import { BackupOutputSchema, GhStatusSchema, HealthSchema } from "../schemas/system.ts";
import { base } from "./base.ts";

export const system = {
	doctor: base
		.route({ method: "GET", path: "/doctor", summary: "Inspect the local host and execution service" })
		.input(z.object({}))
		.output(DiagnosticsSchema),
	stopNativeWork: base
		.route({ method: "POST", path: "/native-work/stop", summary: "Stop local work and its execution service" })
		.input(z.object({}))
		.output(z.object({ stopped: z.number() })),
	chooseDirectory: base
		.route({ method: "POST", path: "/choose-directory", summary: "Select a directory on the server computer" })
		.output(z.string().nullable()),
	health: base.route({ method: "GET", path: "/health", summary: "Read server health" }).output(HealthSchema),
	gh: base.route({ method: "GET", path: "/gh", summary: "Read the gh state" }).output(GhStatusSchema),
	checkGh: base
		.route({ method: "POST", path: "/gh/check", summary: "Run gh auth status and read the new gh state" })
		.input(z.object({}))
		.output(GhStatusSchema),
	backup: base
		.errors(pickErrors(["BACKUP_FAILED"]))
		.route({ method: "POST", path: "/backup", summary: "Write a backup archive under the data home" })
		.output(BackupOutputSchema),
};
