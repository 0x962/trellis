import { z } from "zod";
import { PrStateSchema } from "./enums.ts";
import { FlowExecutionStateSchema } from "./flowExecution.ts";
import { CountSchema } from "./primitives.ts";

const FailedCheckSchema = z.object({
	name: z.string().min(1),
	workflow: z.string().nullable(),
});

export const TicketPrSchema = z.object({
	number: z.number().int().positive(),
	owner: z.string().min(1),
	repo: z.string().min(1),
	url: z.string().min(1),
	state: PrStateSchema,
	isDraft: z.boolean(),
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
	flowRuns: z.array(z.object({ state: FlowExecutionStateSchema.shape.status })),
	baseRef: z.string(),
	headRef: z.string(),
});
export type TicketPr = z.infer<typeof TicketPrSchema>;
