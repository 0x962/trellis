import { z } from "zod";
import type { PrKind, PrPathFacts } from "../prPaths/index.ts";
import { PrStateSchema } from "./enums.ts";
import { FlowExecutionStateSchema } from "./flowExecution.ts";
import { CountSchema, UlidSchema } from "./primitives.ts";

const FailedCheckSchema = z.object({
	name: z.string().min(1),
	workflow: z.string().nullable(),
});

const prKindValues: Record<PrKind, null> = {
	frontend: null,
	backend: null,
	mixed: null,
};

const PrKindSchema = z.enum(Object.keys(prKindValues) as [PrKind, ...PrKind[]]);

const PrRiskSchema: z.ZodType<PrPathFacts["risk"]> = z.object({
	auth: z.enum(["yes", "no"]),
	migration: z.enum(["yes", "no"]),
	dependency: z.enum(["yes", "no"]),
	sharedType: z.enum(["yes", "no"]),
	deletedTest: z.enum(["yes", "no"]),
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
	// A null `kind` or `risk` means the poller has no complete file list.
	// A null `evidence` means the poller has no complete file list or no head SHA.
	// `evidence` counts the records of the evidence floor that the pull request
	// carries at its head commit, and `evidenceRequired` counts the records that
	// floor asks for. The two are null together, so a reader of one number
	// always has the other.
	kind: PrKindSchema.nullable(),
	risk: PrRiskSchema.nullable(),
	evidence: CountSchema.nullable(),
	evidenceRequired: CountSchema.nullable(),
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
	// `flowRunCount` gives the total number of executions for that ticket.
	flowRuns: z.array(
		z.object({
			name: z.string().min(1),
			status: FlowExecutionStateSchema.shape.status,
			findings: CountSchema,
		}),
	),
	flowRunCount: CountSchema,
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
