import { z } from "zod";

export const ReferenceSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RevisionSchema = z.int().positive();
export const TimestampSchema = z.iso.datetime();
export const EngineJobBindingV1Schema = z.strictObject({
	executionId: ReferenceSchema,
	publicationId: ReferenceSchema,
	engineJobId: z.uuid(),
	engineEpoch: RevisionSchema,
});
export const OccurrenceV1Schema = z.strictObject({
	nodeId: ReferenceSchema,
	occurrenceKey: ReferenceSchema,
	parentOccurrenceKey: ReferenceSchema.nullable(),
	phase: z.enum(["step", "children", "condition"]),
	iterationPath: z.array(z.strictObject({ loopNodeId: ReferenceSchema, round: z.int().positive() })),
});
export type EngineJobBindingV1 = z.infer<typeof EngineJobBindingV1Schema>;
export type OccurrenceV1 = z.infer<typeof OccurrenceV1Schema>;
