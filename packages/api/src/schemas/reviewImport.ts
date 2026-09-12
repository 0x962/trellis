import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives";
import { ReviewRefSchema } from "./review";

const message = z.object({
	id: z.string().min(1),
	author: z.string(),
	session: z.string().optional(),
	body: z.string(),
	createdAt: IsoDateTimeSchema,
});
export const MarginFileSchema = z.object({
	url: ReviewRefSchema,
	comments: z.array(
		message.extend({
			path: z.string().min(1),
			side: z.enum(["old", "new"]).default("new"),
			line: z.number().int().positive(),
			startLine: z.number().int().positive().optional(),
			status: z.enum(["open", "resolved"]),
			updatedAt: IsoDateTimeSchema,
			resolvedBy: z.string().optional(),
			resolvedAt: IsoDateTimeSchema.optional(),
			replies: z.array(message),
		}),
	),
});
export const ReviewImportSchema = z.object({
	source: z.string().min(1).max(4096),
	dryRun: z.boolean().default(true),
	files: z.array(MarginFileSchema).max(1000),
});
export type ReviewImport = z.output<typeof ReviewImportSchema>;
export const ReviewImportResultSchema = z.object({
	imported: z.number(),
	skipped: z.number(),
	conflicts: z.array(z.object({ pr: z.string(), id: z.string() })),
	mapping: z.array(z.object({ pr: z.string(), legacyId: z.string(), id: z.string() })),
});
