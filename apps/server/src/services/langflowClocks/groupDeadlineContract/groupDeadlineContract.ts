import { z } from "zod";
import { EngineJobBindingV1Schema, GroupDeadlineV1Schema, OccurrenceV1Schema, ReferenceSchema, TimestampSchema } from "../../../langflowContracts";

export const GroupDeadlineRequestSchema = z.strictObject({
	...EngineJobBindingV1Schema.shape,
	scopeVertexId: ReferenceSchema,
	occurrenceKey: ReferenceSchema,
});
export const GroupDeadlineScopeSchema = z.strictObject({
	...GroupDeadlineRequestSchema.shape,
	groupDefinition: z.record(z.string(), z.unknown()),
	occurrence: OccurrenceV1Schema,
	scope: z.strictObject({
		parentOccurrenceKey: ReferenceSchema.nullable(),
		phase: OccurrenceV1Schema.shape.phase,
		iterationPath: OccurrenceV1Schema.shape.iterationPath,
		inputReceiptIds: z.array(ReferenceSchema),
		groupDeadlineRefs: z.array(ReferenceSchema),
		deadlineAt: TimestampSchema.nullable(),
	}),
});
export const GroupDeadlineResultSchema = z.strictObject({
	deadline: GroupDeadlineV1Schema,
	groupDeadlineRefs: z.array(ReferenceSchema),
	deadlineAt: TimestampSchema.nullable(),
});
export type GroupDeadlineRequest = z.infer<typeof GroupDeadlineRequestSchema>;
export type GroupDeadlineScope = z.infer<typeof GroupDeadlineScopeSchema>;
export type GroupDeadlineResult = z.infer<typeof GroupDeadlineResultSchema>;
