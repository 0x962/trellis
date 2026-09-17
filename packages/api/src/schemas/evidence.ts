import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const EvidenceRunInputSchema = z.object({ runId: UlidSchema });
export const EvidenceHistoryInputSchema = EvidenceRunInputSchema.extend({
	before: z.string().min(1).optional(),
	limit: z.number().int().min(1).max(100).default(100),
});
export const EvidenceFileInputSchema = EvidenceRunInputSchema.extend({ path: z.string().min(1).max(4096) });
export const EvidenceCheckInputSchema = EvidenceRunInputSchema.extend({
	requestId: z.uuid().optional(),
	command: z
		.string()
		.min(1, "Enter a command of 1 to 4096 characters.")
		.max(4096, "Enter a command of 1 to 4096 characters."),
	args: z
		.array(z.string().max(20000, "Enter an argument of 20,000 characters or less."))
		.max(100, "Enter 100 arguments or less."),
	timeoutMs: z.number().int().min(100).max(600000),
});
export const EvidenceRevisionSchema = z.object({ head: z.string(), fingerprint: z.string() });
export const EvidenceWorkspaceSchema = EvidenceRevisionSchema.extend({
	runId: UlidSchema,
	attemptId: z.string(),
	files: z.array(
		z.object({
			path: z.string(),
			kind: z.enum(["file", "symlink", "missing"]),
			sha256: z.string().nullable(),
			status: z.string(),
		}),
	),
	diff: z.string(),
	truncated: z.boolean(),
});
export const EvidenceFileSchema = z.object({
	path: z.string(),
	text: z.string().nullable(),
	sha256: z.string(),
	bytes: z.number(),
	truncated: z.boolean(),
	binary: z.boolean(),
});
export const EvidenceCheckSchema = EvidenceRevisionSchema.extend({
	id: z.string(),
	runId: UlidSchema,
	attemptId: z.string(),
	command: z.string(),
	args: z.array(z.string()),
	timeoutMs: z.number(),
	state: z.enum(["starting", "running", "passed", "failed", "timed_out", "unknown"]),
	exitCode: z.number().nullable(),
	output: z.string(),
	truncated: z.boolean(),
	error: z.string().nullable(),
	finishedFingerprint: z.string().nullable(),
	createdAt: IsoDateTimeSchema,
	finishedAt: IsoDateTimeSchema.nullable(),
	current: z.boolean(),
});
export const EvidenceArtifactSchema = EvidenceRevisionSchema.extend({
	id: UlidSchema,
	runId: UlidSchema,
	attemptId: z.string(),
	path: z.string(),
	sha256: z.string(),
	bytes: z.number(),
	createdAt: IsoDateTimeSchema,
	current: z.boolean(),
});
export const EvidenceStoredCheckSchema = EvidenceCheckSchema.omit({ current: true });
export const EvidenceStoredArtifactSchema = EvidenceArtifactSchema.omit({ current: true });
export const EvidenceHistoryItemSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("check"), check: EvidenceStoredCheckSchema }),
	z.object({ kind: z.literal("artifact"), artifact: EvidenceStoredArtifactSchema }),
]);
export const EvidenceHistorySchema = z.object({
	items: z.array(EvidenceHistoryItemSchema),
	nextCursor: z.string().nullable(),
});
export const EvidenceListSchema = EvidenceRevisionSchema.extend({
	checks: z.array(EvidenceCheckSchema),
	artifacts: z.array(EvidenceArtifactSchema),
	readyForReview: z.boolean(),
});
export type EvidenceCheckInput = z.infer<typeof EvidenceCheckInputSchema>;
export type EvidenceCheck = z.infer<typeof EvidenceCheckSchema>;
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;
export type EvidenceStoredCheck = z.infer<typeof EvidenceStoredCheckSchema>;
export type EvidenceStoredArtifact = z.infer<typeof EvidenceStoredArtifactSchema>;
export type EvidenceHistoryInput = z.infer<typeof EvidenceHistoryInputSchema>;
export type EvidenceHistoryItem = z.infer<typeof EvidenceHistoryItemSchema>;
export type EvidenceHistory = z.infer<typeof EvidenceHistorySchema>;
