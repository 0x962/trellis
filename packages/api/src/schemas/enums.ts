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

// How a pull request got onto a ticket. `manual`: a person or an agent
// linked it. `auto`: the auto-link scan found the ticket identifier in the PR.
export const PrLinkSourceSchema = z.enum(["manual", "auto"]);
export type PrLinkSource = z.infer<typeof PrLinkSourceSchema>;

// Why gh cannot serve a request.
export const GhReasonSchema = z.enum(["missing", "unauthenticated", "error"]);
export type GhReason = z.infer<typeof GhReasonSchema>;

// The job of one agent session. One manager per project dispatches tickets;
// a builder works one ticket to a PR; a reviewer runs one review of that PR.
export const AgentRoleSchema = z.enum(["manager", "builder", "reviewer"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// The program that starts and wakes agents. Superset is the only runner.
export const AgentRunnerSchema = z.enum(["superset"]);
export type AgentRunner = z.infer<typeof AgentRunnerSchema>;

// `starting`: the runner was asked and has not reported the terminal.
// `running`: the agent works a turn. `waiting`: the agent is idle at its
// prompt. `exited`: the agent process ended by itself. `stopped`: trellis
// stopped it. `failed`: the runner refused the start, so the agent never
// ran; the session row then carries why.
export const AgentStateSchema = z.enum(["starting", "running", "waiting", "exited", "stopped", "failed"]);
export type AgentState = z.infer<typeof AgentStateSchema>;

// Why the runner cannot serve a request. `missing`: the runner binary is
// not found. `disabled`: the global or the project switch in the agent
// settings is off. `unmapped`: no runner project matches the trellis
// project. `branch`: the base branch is not in the runner project's
// repository. `error`: a runner command exited nonzero.
export const RunnerReasonSchema = z.enum(["missing", "disabled", "unmapped", "branch", "error"]);
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
