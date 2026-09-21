import { z } from "zod";
import { EpicRefStringSchema, WaveRefStringSchema } from "../refs.ts";
import { EpicCountsSchema, EpicStateSchema } from "./epicCounts.ts";
import { booleanString, IsoDateTimeSchema, slugPattern, UlidSchema } from "./primitives.ts";

// A wave is one ordered phase of an epic. A wave belongs to one
// epic. A ticket belongs to at most one wave, and that wave
// belongs to the epic of the ticket. The counts and the state of a wave
// derive from its tickets and are never stored.

export const WAVE_NAME_MAX = 120;

export const WaveNameSchema = z
	.string()
	.trim()
	.min(1, `Enter a wave name of 1 to ${WAVE_NAME_MAX} characters.`)
	.max(WAVE_NAME_MAX, `Enter a wave name of 1 to ${WAVE_NAME_MAX} characters.`);

// A wave slug is the last segment of the `KEY/epic-slug/wave-slug`
// ref. Two waves of one epic never share a slug.
export const WaveSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// One wave of an epic. `position` orders the waves of the epic:
// a lower position comes first. A delete leaves a gap in the positions.
// `counts` and `state` follow the rules of the epic. `toStart` counts the
// todo tickets whose dependencies are done. `waitsForYou` counts each ticket
// whose turn is the person. A ticket contributes at most one to the count.
export const WaveSummarySchema = z.object({
	id: UlidSchema,
	epicId: UlidSchema,
	ref: z.string().min(1),
	slug: WaveSlugSchema,
	name: z.string().min(1),
	position: z.number().int().min(0),
	counts: EpicCountsSchema,
	state: EpicStateSchema,
	toStart: z.number().int().min(0),
	waitsForYou: z.number().int().min(0),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type WaveSummary = z.infer<typeof WaveSummarySchema>;

// The wave fields a ticket row carries. `ref` is the canonical
// wave ref, `OP/routine-runtime/phase-1`.
export const WaveLinkSchema = z.object({
	id: UlidSchema,
	ref: z.string().min(1),
	name: z.string().min(1),
});
export type WaveLink = z.infer<typeof WaveLinkSchema>;

// The new wave takes the last position of the epic. `slug` derives
// from `name` when absent. A derived slug that another wave of the epic
// holds gets a numeric suffix; a given slug that is taken is DUPLICATE.
export const WaveCreateInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	name: WaveNameSchema,
	slug: WaveSlugSchema.optional(),
});
export type WaveCreateInput = z.input<typeof WaveCreateInputSchema>;

// A field that is absent keeps its value.
export const WaveUpdateInputSchema = z.strictObject({
	wave: WaveRefStringSchema,
	name: WaveNameSchema.optional(),
	slug: WaveSlugSchema.optional(),
});
export type WaveUpdateInput = z.input<typeof WaveUpdateInputSchema>;

// `waves` names every wave of the epic once, in the new order. A
// list that omits one, repeats one, or names a wave of another epic is
// WAVE_OUTSIDE_EPIC.
export const WaveReorderInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
	waves: z.array(WaveRefStringSchema).min(1),
});
export type WaveReorderInput = z.input<typeof WaveReorderInputSchema>;

export const WaveListOutputSchema = z.array(WaveSummarySchema);

// An agent actor needs `force`, as for an epic delete.
export const WaveDeleteInputSchema = z.strictObject({
	wave: WaveRefStringSchema,
	force: booleanString.optional(),
});
export type WaveDeleteInput = z.input<typeof WaveDeleteInputSchema>;

export const WaveDeleteOutputSchema = z.object({
	id: UlidSchema,
});
export type WaveDeleteOutput = z.infer<typeof WaveDeleteOutputSchema>;
