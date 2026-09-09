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

export const CiStateSchema = z.enum(["none", "pending", "pass", "fail"]);
export type CiState = z.infer<typeof CiStateSchema>;

export const ReviewStateSchema = z.enum(["none", "review_required", "approved", "changes_requested"]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

// How a pull request got onto a ticket. `manual`: a person or an agent
// linked it. `auto`: the auto-link scan found the ticket identifier in the PR.
export const PrLinkSourceSchema = z.enum(["manual", "auto"]);
export type PrLinkSource = z.infer<typeof PrLinkSourceSchema>;

// Why gh cannot serve a request.
export const GhReasonSchema = z.enum(["missing", "unauthenticated", "error"]);
export type GhReason = z.infer<typeof GhReasonSchema>;

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
