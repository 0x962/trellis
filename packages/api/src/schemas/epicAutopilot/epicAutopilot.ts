import { z } from "zod";
import { HarnessSchema } from "../../harness/harness.ts";
import { EpicRefStringSchema } from "../../refs.ts";
import { UlidSchema } from "../primitives.ts";

export const EpicAutopilotSchema = z.strictObject({
	enabled: z.boolean(),
	maxConcurrency: z.number().int().positive(),
	harness: HarnessSchema,
	accountId: UlidSchema.nullable(),
});
export type EpicAutopilot = z.infer<typeof EpicAutopilotSchema>;

export const EpicAutopilotSetInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	autopilot: EpicAutopilotSchema,
});
export type EpicAutopilotSetInput = z.input<typeof EpicAutopilotSetInputSchema>;
