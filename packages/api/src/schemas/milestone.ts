import { z } from "zod";
import { EpicRefStringSchema, MilestoneRefStringSchema } from "../refs.ts";
import { EpicCountsSchema, EpicStateSchema } from "./epicCounts.ts";
import { booleanString, IsoDateTimeSchema, slugPattern, UlidSchema } from "./primitives.ts";

// A milestone is one ordered phase of an epic. A milestone belongs to one
// epic. A ticket belongs to at most one milestone, and that milestone
// belongs to the epic of the ticket. The counts and the state of a milestone
// derive from its tickets and are never stored.

export const MILESTONE_NAME_MAX = 120;

export const MilestoneNameSchema = z
	.string()
	.trim()
	.min(1, `Enter a milestone name of 1 to ${MILESTONE_NAME_MAX} characters.`)
	.max(MILESTONE_NAME_MAX, `Enter a milestone name of 1 to ${MILESTONE_NAME_MAX} characters.`);

// A milestone slug is the last segment of the `KEY/epic-slug/milestone-slug`
// ref. Two milestones of one epic never share a slug.
export const MilestoneSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// One milestone of an epic. `position` orders the milestones of the epic:
// a lower position comes first. A delete leaves a gap in the positions.
// `counts` and `state` follow the rules of the epic.
export const MilestoneSummarySchema = z.object({
	id: UlidSchema,
	epicId: UlidSchema,
	ref: z.string().min(1),
	slug: MilestoneSlugSchema,
	name: z.string().min(1),
	position: z.number().int().min(0),
	counts: EpicCountsSchema,
	state: EpicStateSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type MilestoneSummary = z.infer<typeof MilestoneSummarySchema>;

// The milestone fields a ticket row carries. `ref` is the canonical
// milestone ref, `OP/routine-runtime/phase-1`.
export const MilestoneLinkSchema = z.object({
	id: UlidSchema,
	ref: z.string().min(1),
	name: z.string().min(1),
});
export type MilestoneLink = z.infer<typeof MilestoneLinkSchema>;

// The new milestone takes the last position of the epic. `slug` derives
// from `name` when absent. A derived slug that another milestone of the epic
// holds gets a numeric suffix; a given slug that is taken is DUPLICATE.
export const MilestoneCreateInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	name: MilestoneNameSchema,
	slug: MilestoneSlugSchema.optional(),
});
export type MilestoneCreateInput = z.input<typeof MilestoneCreateInputSchema>;

// A field that is absent keeps its value.
export const MilestoneUpdateInputSchema = z.strictObject({
	milestone: MilestoneRefStringSchema,
	name: MilestoneNameSchema.optional(),
	slug: MilestoneSlugSchema.optional(),
});
export type MilestoneUpdateInput = z.input<typeof MilestoneUpdateInputSchema>;

// `milestones` names every milestone of the epic once, in the new order. A
// list that omits one, repeats one, or names a milestone of another epic is
// MILESTONE_OUTSIDE_EPIC.
export const MilestoneReorderInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	milestones: z.array(MilestoneRefStringSchema).min(1),
});
export type MilestoneReorderInput = z.input<typeof MilestoneReorderInputSchema>;

export const MilestoneListOutputSchema = z.array(MilestoneSummarySchema);

// An agent actor needs `force`, as for an epic delete.
export const MilestoneDeleteInputSchema = z.strictObject({
	milestone: MilestoneRefStringSchema,
	force: booleanString.optional(),
});
export type MilestoneDeleteInput = z.input<typeof MilestoneDeleteInputSchema>;

export const MilestoneDeleteOutputSchema = z.object({
	id: UlidSchema,
});
export type MilestoneDeleteOutput = z.infer<typeof MilestoneDeleteOutputSchema>;
