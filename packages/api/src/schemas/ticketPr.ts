import { z } from "zod";
import { PrStateSchema } from "./enums.ts";
import { FlowExecutionStateSchema } from "./flowExecution.ts";
import { CountSchema, UlidSchema } from "./primitives.ts";

const FailedCheckSchema = z.object({
	name: z.string().min(1),
	workflow: z.string().nullable(),
});

export const TicketPrSchema = z.object({
	id: UlidSchema,
	number: z.number().int().positive(),
	owner: z.string().min(1),
	repo: z.string().min(1),
	url: z.string().min(1),
	title: z.string(),
	state: PrStateSchema,
	isDraft: z.boolean(),
	isQueued: z.boolean(),
	additions: CountSchema.nullable(),
	deletions: CountSchema.nullable(),
	changedFiles: CountSchema.nullable(),
	sizeBand: z.enum(["small", "medium", "large"]).nullable(),
	pass: CountSchema,
	fail: CountSchema,
	pending: CountSchema,
	skipped: CountSchema,
	failedChecks: z.array(FailedCheckSchema),
	openThreads: CountSchema,
	// The current verdict of the person, from `currentVerdict`.
	verdict: z.enum(["approved", "changes_requested"]).nullable(),
	// Each `TicketPrSchema` result carries the five newest executions of its ticket.
	// A finding is a review comment that an agent of that execution wrote.
	flowRuns: z.array(
		z.object({
			name: z.string().min(1),
			status: FlowExecutionStateSchema.shape.status,
			findings: CountSchema,
		}),
	),
	baseRef: z.string(),
	headRef: z.string(),
	stackedOn: z
		.object({
			number: z.number().int().positive(),
			headRef: z.string(),
			ticketIdentifier: z.string(),
		})
		.nullable(),
});
export type TicketPr = z.infer<typeof TicketPrSchema>;
