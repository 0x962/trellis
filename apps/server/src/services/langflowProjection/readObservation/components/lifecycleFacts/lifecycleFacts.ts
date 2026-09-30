import { FlowStepStateSchema, IsoDateTimeSchema } from "@trellis/api";
import { z } from "zod";

export const lifecycleFacts = z.strictObject({
	state: FlowStepStateSchema,
	acceptedResultId: z.string().nullable(),
	startedAt: IsoDateTimeSchema.nullable(),
	endedAt: IsoDateTimeSchema.nullable(),
	error: z.string().nullable(),
	skipReason: z.string().nullable(),
});
