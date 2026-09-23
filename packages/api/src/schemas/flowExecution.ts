import { z } from "zod";
import { FlowDocSchema, FlowRefSchema } from "./flow.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
export const FlowStepStateSchema = z.enum([
	"pending",
	"ready",
	"running",
	"waiting_human",
	"unknown",
	"succeeded",
	"skipped",
	"failed",
	"canceled",
]);
export const FlowExecutionStateSchema = z.object({
	version: z.literal(1),
	flowId: z.string(),
	flowVersion: z.number().int(),
	status: z.enum(["running", "waiting", "succeeded", "failed", "canceled"]),
	startedAt: z.number(),
	updatedAt: z.number(),
	error: z.string().nullable(),
	steps: z.array(
		z.object({
			key: z.string(),
			actionKey: z.string(),
			nodeId: z.string(),
			parentKey: z.string().nullable(),
			iteration: z.number().int(),
			round: z.number().int(),
			state: FlowStepStateSchema,
			phase: z.enum(["step", "children", "condition"]),
			output: z.string().nullable(),
			decision: z.enum(["yes", "no"]).nullable(),
			error: z.string().nullable(),
			startedAt: z.number().nullable(),
			// The time the step became final: succeeded, skipped, failed, or canceled.
			endedAt: z.number().nullable(),
			deadlineAt: z.number().nullable(),
			needsStop: z.boolean(),
		}),
	),
});
export const FlowExecutionTaskSchema = z.object({
	key: z.string(),
	runId: UlidSchema,
	attemptId: z.string(),
	resultId: z.string().nullable(),
});
export const FlowExecutionSchema = z.object({
	id: UlidSchema,
	flowId: UlidSchema,
	ticketId: UlidSchema,
	projectId: UlidSchema,
	revision: z.number().int().positive(),
	// The commit the caller named when it started the run. `trellis ready`
	// asks for a run of the commit the pull request now points at, so a run
	// that names no commit answers no pull request.
	headSha: z.string().nullable(),
	doc: FlowDocSchema,
	state: FlowExecutionStateSchema,
	tasks: z.array(FlowExecutionTaskSchema),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export const FlowExecutionStartInputSchema = z.strictObject({
	flow: FlowRefSchema,
	ticket: z.string().min(1),
	// The head commit of the pull request this run answers.
	headSha: z.string().min(1).max(64).optional(),
	requestId: z.uuid(),
	expectedVersion: z.number().int().positive(),
});
export const FlowExecutionGetInputSchema = z.strictObject({ id: UlidSchema });
export const FlowExecutionListInputSchema = z.strictObject({
	flow: FlowRefSchema.optional(),
	ticket: z.string().min(1).optional(),
});
export const FlowExecutionDecisionInputSchema = z.strictObject({
	id: UlidSchema,
	key: z.string().min(1).max(100000),
	approved: z.boolean(),
	output: z.string().max(512 * 1024),
	expectedRevision: z.number().int().positive(),
});
export const FlowExecutionCancelInputSchema = z.strictObject({
	id: UlidSchema,
	expectedRevision: z.number().int().positive(),
});
export type FlowExecutionRecord = z.infer<typeof FlowExecutionSchema>;
export type FlowExecutionStartInput = z.infer<typeof FlowExecutionStartInputSchema>;
export type FlowExecutionListInput = z.infer<typeof FlowExecutionListInputSchema>;
export type FlowExecutionDecisionInput = z.infer<typeof FlowExecutionDecisionInputSchema>;
export type FlowExecutionCancelInput = z.infer<typeof FlowExecutionCancelInputSchema>;
