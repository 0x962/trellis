import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { CheckBucketSchema, CiStateSchema, PrLinkSourceSchema, PrStateSchema, ReviewStateSchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// One CI check on a pull request, sorted by workflow and name. `bucket` is
// the bucket gh reported; `ciState` on the pull request folds the buckets,
// where `cancel` counts as `fail` and `skipping` as nothing.
export const CheckSchema = z.object({
	name: z.string().min(1),
	workflow: z.string().nullable(),
	bucket: CheckBucketSchema,
	link: z.string().nullable(),
});
export type Check = z.infer<typeof CheckSchema>;

// `fetchError` holds the last gh failure; the row stays linked with stale
// fields until a poll succeeds.
export const PullRequestSchema = z.object({
	id: UlidSchema,
	owner: z.string().min(1),
	repo: z.string().min(1),
	number: z.number().int().positive(),
	additions: CountSchema.nullable(),
	deletions: CountSchema.nullable(),
	changedFiles: CountSchema.nullable(),
	url: z.string().min(1),
	title: z.string(),
	state: PrStateSchema,
	isDraft: z.boolean(),
	headRef: z.string(),
	baseRef: z.string(),
	reviewState: ReviewStateSchema,
	mergedAt: IsoDateTimeSchema.nullable(),
	closedAt: IsoDateTimeSchema.nullable(),
	checks: z.array(CheckSchema),
	ciState: CiStateSchema,
	fetchedAt: IsoDateTimeSchema.nullable(),
	fetchError: z.string().nullable(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

// A pull request as seen from one ticket: the row plus how it got there.
export const LinkedPullRequestSchema = PullRequestSchema.extend({
	source: PrLinkSourceSchema,
	linkedBy: ActorRefSchema,
	linkedAt: IsoDateTimeSchema,
});
export type LinkedPullRequest = z.infer<typeof LinkedPullRequestSchema>;

export const PullRequestListInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
});

export const PullRequestLinkInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	url: z.string().min(1),
});
export type PullRequestLinkInput = z.input<typeof PullRequestLinkInputSchema>;

export const PullRequestUnlinkInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	id: UlidSchema,
});

export const PullRequestUnlinkOutputSchema = z.object({
	deleted: UlidSchema,
});

export const PullRequestIdInputSchema = z.strictObject({
	id: UlidSchema,
});

// A diff over 1 MB is cut and `truncated` is true; `url` opens the whole
// diff on GitHub.
export const PullRequestDiffOutputSchema = z.object({
	diff: z.string(),
	truncated: z.boolean(),
	url: z.string().min(1),
});
export type PullRequestDiffOutput = z.infer<typeof PullRequestDiffOutputSchema>;
