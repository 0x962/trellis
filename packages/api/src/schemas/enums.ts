import { z } from "zod";

// Every closed set the wire carries. Option order is the sort order the web
// uses for priorities and status groups, so the order is part of the contract.

export const PrioritySchema = z.enum(["none", "urgent", "high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const StatusCategorySchema = z.enum(["todo", "started", "review", "done", "canceled"]);
export type StatusCategory = z.infer<typeof StatusCategorySchema>;

// Who reviews a ticket in a `review` status. Only a review status carries a reviewer.
export const ReviewerSchema = z.enum(["human", "agent"]);
export type Reviewer = z.infer<typeof ReviewerSchema>;

// The kinds a client may send in `x-trellis-actor`. `system` is the poller's
// own kind: the header rejects it, and stored rows carry it.
export const ActorKindSchema = z.enum(["human", "agent"]);
export type ActorKind = z.infer<typeof ActorKindSchema>;

export const StoredActorKindSchema = z.enum(["human", "agent", "system"]);
export type StoredActorKind = z.infer<typeof StoredActorKindSchema>;

export const PrStateSchema = z.enum(["open", "closed", "merged"]);
export type PrState = z.infer<typeof PrStateSchema>;

// The CI state of one pull request, folded from its checks: any `fail` or
// `cancel` check gives `fail`; else any `pending` gives `pending`; else any
// `pass` gives `pass`; else `none`.
export const CiStateSchema = z.enum(["none", "pending", "pass", "fail"]);
export type CiState = z.infer<typeof CiStateSchema>;

// The bucket gh reports for one check, kept verbatim in the checks snapshot.
export const CheckBucketSchema = z.enum(["pass", "fail", "pending", "skipping", "cancel"]);
export type CheckBucket = z.infer<typeof CheckBucketSchema>;

export const ReviewStateSchema = z.enum(["none", "review_required", "approved", "changes_requested"]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

// A person or an agent explicitly links each pull request to a ticket.
export const PrLinkSourceSchema = z.enum(["manual"]);
export type PrLinkSource = z.infer<typeof PrLinkSourceSchema>;

// Whether the agent asked the person to review a pull request. A pull
// request that an agent links starts as `not-ready`, and `trellis ready`
// writes `ready` when the agent asks for review. The agent asking is one
// part of being ready for review; `reviewGaps` holds the whole rule.
export const LocalPrStateSchema = z.enum(["not-ready", "ready"]);
export type LocalPrState = z.infer<typeof LocalPrStateSchema>;

// Whether GitHub can merge the head of a pull request into its base branch.
// GitHub computes the answer after a push or a base change, and answers
// `unknown` until it has one.
export const MergeableSchema = z.enum(["mergeable", "conflicting", "unknown"]);
export type Mergeable = z.infer<typeof MergeableSchema>;

// Why gh cannot serve a request.
export const GhReasonSchema = z.enum(["missing", "unauthenticated", "error"]);
export type GhReason = z.infer<typeof GhReasonSchema>;

// Why the runner cannot serve a request. `missing`: the runner binary is
// not found. `disabled`: the global or the project switch in the agent
// settings is off. `unmapped`: no runner project matches the trellis
// project. `branch`: the repository holds no branch with the name of the
// project's base branch. `host`: the Superset host the project names is
// offline, or no host carries that id. `outdated`: the installed runner
// binary is too old, and it cannot do what the request asks for. `error`:
// a runner command exited nonzero.
export const RunnerReasonSchema = z.enum(["missing", "disabled", "unmapped", "branch", "host", "outdated", "error"]);
export type RunnerReason = z.infer<typeof RunnerReasonSchema>;

// The palette token names a status may take as its color. The web resolves
// a token through the theme, so one name draws right in light and dark mode.
// A raw color value has no dark variant, so the wire never carries one.
export const ColorTokenSchema = z.enum([
	"fg",
	"fg-muted",
	"fg-faint",
	"accent",
	"agent",
	"success",
	"warning",
	"danger",
]);
export type ColorToken = z.infer<typeof ColorTokenSchema>;

// The hue names a label may take as its color. packages/ui holds one
// `--label-<hue>` token per name, with a light and a dark value, so the wire
// never carries a raw color value. A color picker lists the hues in this order.
export const LabelColorSchema = z.enum(["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]);
export type LabelColor = z.infer<typeof LabelColorSchema>;

// The color names a project may take. packages/ui holds one
// `--project-<name>` token set per name, with a light and a dark value, so
// the wire never carries a raw color value. Two projects never hold one
// name, so the five names are five slots. Yellow marks the work that waits
// for a person and violet marks a merged pull request, so no project takes
// either hue. A color picker lists the names in this order.
export const ProjectColorSchema = z.enum(["orange", "teal", "blue", "pink", "azure"]);
export type ProjectColor = z.infer<typeof ProjectColorSchema>;
