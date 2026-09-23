import { z } from "zod";
import { EpicRefStringSchema, ProjectRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { EpicCountsSchema, EpicStateSchema } from "./epicCounts.ts";
import { booleanString, IsoDateTimeSchema, KeySchema, slugPattern, UlidSchema } from "./primitives.ts";
import { TicketSummarySchema } from "./ticket.ts";
import { WaveLinkSchema, WaveSummarySchema } from "./wave.ts";

export { type EpicCounts, EpicCountsSchema, type EpicState, EpicStateSchema } from "./epicCounts.ts";
export { type EpicLink, EpicLinkSchema } from "./epicLink.ts";

// An epic groups the tickets that deliver one plan inside a project. Its
// `description` holds the plan as markdown. An epic is its own record, not
// a ticket. A ticket belongs to at most one epic, and the epic sits in the
// project of the ticket. The state of an epic derives from its tickets
// and is never stored.

export const EPIC_NAME_MAX = 120;
export const EPIC_DESCRIPTION_MAX = 200000;

export const EpicNameSchema = z
	.string()
	.trim()
	.min(1, `Enter an epic name of 1 to ${EPIC_NAME_MAX} characters.`)
	.max(EPIC_NAME_MAX, `Enter an epic name of 1 to ${EPIC_NAME_MAX} characters.`);

export const EpicDescriptionSchema = z
	.string()
	.max(EPIC_DESCRIPTION_MAX, `Enter an epic description of ${EPIC_DESCRIPTION_MAX} characters or less.`);

// An epic slug is one segment of the `KEY/slug` ref. Two epics of one root
// never share a slug.
export const EpicSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// One row of the epic list. `actor` is the last writer of the record.
// `currentWave` is the first wave in position order whose state is
// open, and null when the epic has no open wave. `currentWaveIndex`
// is its place among the waves of the epic, from 1, and null with it.
export const EpicSummarySchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	projectKey: KeySchema,
	ref: z.string().min(1),
	slug: EpicSlugSchema,
	name: z.string().min(1),
	description: z.string(),
	counts: EpicCountsSchema,
	state: EpicStateSchema,
	currentWave: WaveLinkSchema.nullable(),
	currentWaveIndex: z.number().int().min(1).nullable(),
	waveCount: z.number().int().min(0),
	resourceCount: z.number().int().min(0),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type EpicSummary = z.infer<typeof EpicSummarySchema>;

// The `epics.get` shape: the summary, the waves of the epic in position
// order, and every ticket of the epic in ticket number order.
export const EpicSchema = EpicSummarySchema.extend({
	waves: z.array(WaveSummarySchema),
	tickets: z.array(TicketSummarySchema),
});
export type Epic = z.infer<typeof EpicSchema>;

// The epics of a project and of every project below it.
export const EpicListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});
export type EpicListInput = z.input<typeof EpicListInputSchema>;

// `slug` derives from `name` when absent. A derived slug that another epic
// of the root holds gets a numeric suffix; a given slug that is taken is
// DUPLICATE.
export const EpicCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	name: EpicNameSchema,
	slug: EpicSlugSchema.optional(),
	description: EpicDescriptionSchema.optional(),
});
export type EpicCreateInput = z.input<typeof EpicCreateInputSchema>;

// A field that is absent keeps its value.
export const EpicUpdateInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	name: EpicNameSchema.optional(),
	slug: EpicSlugSchema.optional(),
	description: EpicDescriptionSchema.optional(),
});
export type EpicUpdateInput = z.input<typeof EpicUpdateInputSchema>;

export const EpicRefInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
});
export type EpicRefInput = z.input<typeof EpicRefInputSchema>;

// An agent actor needs `force`, as for a ticket delete.
export const EpicDeleteInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	force: booleanString.optional(),
});
export type EpicDeleteInput = z.input<typeof EpicDeleteInputSchema>;

export const EpicDeleteOutputSchema = z.object({
	id: UlidSchema,
});
export type EpicDeleteOutput = z.infer<typeof EpicDeleteOutputSchema>;
