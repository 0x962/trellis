import { effortForHarness, HarnessPresetSchema, supportsModel } from "@trellis/api";
import { z } from "zod";

export const ResolvedConversionHarnessSchema = z
	.strictObject({
		preset: HarnessPresetSchema,
		startCommand: z.string().min(1),
		resumeCommand: z.string().min(1),
		model: z.string().min(1).optional(),
		effort: z.string().min(1).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.preset === "custom") {
			if (value.model !== undefined || value.effort !== undefined) {
				ctx.addIssue({ code: "custom", message: "Custom commands require absent model and effort fields." });
			}
			return;
		}
		if (value.model === undefined || !supportsModel(value.preset, value.model)) {
			ctx.addIssue({
				code: "custom",
				path: ["model"],
				message: "Retain an explicit supported model without normalization.",
			});
			return;
		}
		const effort = effortForHarness(value.preset, value.model);
		if (
			effort === null ? value.effort !== undefined : !effort.options.some((option) => option.value === value.effort)
		) {
			ctx.addIssue({
				code: "custom",
				path: ["effort"],
				message: "Retain explicit effort where supported and omit it where the harness has no effort setting.",
			});
		}
	});
