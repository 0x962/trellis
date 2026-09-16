import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { BuiltInHarnessSchema, HarnessModelSchema } from "../harness/harness.ts";
import { DiagnosticsSchema } from "../schemas/diagnostics.ts";
import { BackupOutputSchema, GhStatusSchema, HealthSchema } from "../schemas/system.ts";
import { base } from "./base.ts";

export const system = {
	doctor: base
		.route({ method: "GET", path: "/doctor", summary: "Inspect the local host and execution service" })
		.input(z.object({}))
		.output(DiagnosticsSchema),
	nativeWork: base
		.route({ method: "GET", path: "/native-work", summary: "Read the local work setting" })
		.input(z.object({}))
		.output(z.object({ paused: z.boolean() })),
	resumeNativeWork: base
		.route({ method: "POST", path: "/native-work/resume", summary: "Allow new local work" })
		.input(z.object({}))
		.output(z.object({ paused: z.boolean() })),
	resumeRestart: base
		.route({ method: "POST", path: "/native-work/restart/resume", summary: "Resume agents after a desktop restart" })
		.input(z.object({ restartId: z.string().min(1) }).strict())
		.output(z.object({ resumed: z.number(), skipped: z.number() })),
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
		.route({ method: "POST", path: "/backup", summary: "Write a backup archive under the data home" })
		.output(BackupOutputSchema),
	harnessModels: base
		.route({ method: "GET", path: "/harnesses/{harness}/models", summary: "List the models a harness offers" })
		.input(z.strictObject({ harness: BuiltInHarnessSchema }))
		.errors(pickErrors(["HARNESS_MODELS_FAILED"]))
		.output(z.array(HarnessModelSchema)),
};
