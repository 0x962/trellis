import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The five faults of the statistics page. Each one holds work that no other
// screen of the product reports.
//
// - `agentRunDead`: the assignment of a ticket is open, and the execution
//   service holds no live process for the run.
// - `reviewMessageFailed`: the delivery loop stopped a review message and
//   wrote the reason into `review_deliveries.error`.
// - `reviewMessageHeld`: the ticket of a review message runs no agent, so
//   Trellis keeps the message for the next run of that ticket.
// - `flowRunWaiting`: a flow run sits at a step that only a person answers.
// - `flowRunRunning`: a flow run holds the status running. The age is the
//   time since the last write to the run.
export const StatisticsFaultKindSchema = z.enum([
	"agentRunDead",
	"reviewMessageFailed",
	"reviewMessageHeld",
	"flowRunWaiting",
	"flowRunRunning",
]);
export type StatisticsFaultKind = z.infer<typeof StatisticsFaultKindSchema>;

// The oldest case of one fault. `identifier` and `title` are null for a
// review message that names no ticket: migration 0101 gave a message whose
// run held no ticket the state `failed` and no recipient.
export const StatisticsCaseSchema = z.object({
	identifier: z.string().nullable(),
	title: z.string().nullable(),
	// The moment the age counts from. Each fault names its own column in
	// `StatisticsFaultSchema.ageOf`.
	since: IsoDateTimeSchema,
});
export type StatisticsCase = z.infer<typeof StatisticsCaseSchema>;

export const StatisticsFaultSchema = z.object({
	kind: StatisticsFaultKindSchema,
	count: z.number().int().positive(),
	oldest: StatisticsCaseSchema,
});
export type StatisticsFault = z.infer<typeof StatisticsFaultSchema>;

// One merged pull request of the window, with the count of the threads a
// person wrote on it. `ticket` is null for a pull request that no ticket
// links.
export const StatisticsBillRowSchema = z.object({
	prId: UlidSchema,
	ticket: z.string().nullable(),
	title: z.string(),
	url: z.string(),
	threadsByPerson: z.number().int().positive(),
	// The count of the `changes_requested` verdicts a person gave on this
	// pull request.
	sentBack: z.number().int().nonnegative(),
	mergedAt: IsoDateTimeSchema,
});
export type StatisticsBillRow = z.infer<typeof StatisticsBillRowSchema>;

// The window of block two. It is a count of merged pull requests and never
// a calendar week: between twenty and forty pull requests merge in a week,
// so a week is no stable denominator.
export const STATISTICS_WINDOW = 30;

export const StatisticsLoopSchema = z.object({
	// How many merged pull requests the window holds. It reaches
	// `STATISTICS_WINDOW` once the database holds that many.
	merged: z.number().int().nonnegative(),
	oldestMergedAt: IsoDateTimeSchema.nullable(),
	// The pull requests of the window that carry at least one
	// `changes_requested` verdict from a person.
	sentBack: z.number().int().nonnegative(),
	// The pull requests of the window that carry any verdict from a person.
	withPersonVerdict: z.number().int().nonnegative(),
	// The review threads on the pull requests of the window, by the kind of
	// the actor who opened each one. Both counts come from `review_threads`.
	// The `threads` array of a submission document holds the same threads, so
	// a count that reads both counts each thread twice.
	threadsByPerson: z.number().int().nonnegative(),
	threadsByAgent: z.number().int().nonnegative(),
	// The median wait from the moment a pull request became ready to the
	// first verdict of a person on it, in milliseconds. It is null while no
	// pull request of the window carries both moments.
	readyToVerdictMs: z.number().nonnegative().nullable(),
	// How many pull requests of the window carry both the ready stamp and a
	// verdict after it. The median covers these and no other.
	readyToVerdictMeasured: z.number().int().nonnegative(),
	// The five pull requests of the window with the most threads from a
	// person, most first.
	bill: z.array(StatisticsBillRowSchema),
});
export type StatisticsLoop = z.infer<typeof StatisticsLoopSchema>;

export const StatisticsSchema = z.object({
	// Every fault with at least one case, oldest case first.
	faults: z.array(StatisticsFaultSchema),
	loop: StatisticsLoopSchema,
});
export type Statistics = z.infer<typeof StatisticsSchema>;
