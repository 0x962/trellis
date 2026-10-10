import { z } from "zod";
import { EpicRefStringSchema } from "../../refs.ts";

export const EpicWhiteboardSnapshotSchema = z.record(z.string(), z.json());
export type EpicWhiteboardSnapshot = z.infer<typeof EpicWhiteboardSnapshotSchema>;

export const EpicWhiteboardSchema = z.object({
	snapshot: EpicWhiteboardSnapshotSchema.nullable(),
	revision: z.number().int().min(0),
});
export type EpicWhiteboard = z.infer<typeof EpicWhiteboardSchema>;

export const EpicWhiteboardSaveInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	snapshot: EpicWhiteboardSnapshotSchema,
	expectedRevision: z.number().int().min(0).max(2_147_483_646),
});
export type EpicWhiteboardSaveInput = z.input<typeof EpicWhiteboardSaveInputSchema>;

export const EpicWhiteboardSaveOutputSchema = z.object({
	revision: z.number().int().positive(),
});
export type EpicWhiteboardSaveOutput = z.infer<typeof EpicWhiteboardSaveOutputSchema>;
