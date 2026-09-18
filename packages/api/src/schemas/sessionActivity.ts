import { z } from "zod";
import { UlidSchema } from "./primitives.ts";

export const InputQuestionSchema = z.object({
	id: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
	multiple: z.boolean(),
	minSelections: z.number().int().optional(),
	maxSelections: z.number().int().optional(),
});
export const PendingInputSchema = z.object({
	id: z.string(),
	kind: z.enum(["question", "permission", "elicitation"]),
	title: z.string(),
	blocking: z.boolean(),
	questions: z.array(InputQuestionSchema).optional(),
	sequence: z.number().int().nonnegative(),
	at: z.string(),
});
export type PendingInput = z.infer<typeof PendingInputSchema>;
const occurrence = z.object({ sequence: z.number().int().nonnegative(), at: z.string() });
export const SessionAttentionSchema = z.object({
	sequence: z.number().int().nonnegative(),
	completion: occurrence.nullable(),
	failure: occurrence.nullable(),
	requests: z.array(PendingInputSchema),
});
export const InputAnswerSchema = z.object({
	questionId: z.string(),
	selectedLabel: z.string().optional(),
	selectedLabels: z.array(z.string()).optional(),
	freeText: z.string().max(500).optional(),
});
export type InputAnswer = z.infer<typeof InputAnswerSchema>;

export const AgentSeenInputSchema = z.strictObject({
	id: UlidSchema,
	attemptId: z.string().min(1),
	sequence: z.number().int().nonnegative(),
});
export const AgentAnswerInputSchema = z.strictObject({
	id: UlidSchema,
	attemptId: z.string().min(1),
	requestId: z.string().min(1),
	answers: z.array(InputAnswerSchema),
	cancel: z.boolean(),
});
