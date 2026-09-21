import { z } from "zod";
import {
	EpicRefStringSchema,
	LabelRefStringSchema,
	ProjectRefStringSchema,
	StatusRefStringSchema,
	TicketRefStringSchema,
	WaveRefStringSchema,
} from "../refs.ts";
import { PrioritySchema } from "./enums.ts";
import { booleanString, CountSchema, UlidSchema } from "./primitives.ts";
import { TicketIdentifierSchema, TicketSchema, TicketSummarySchema, TicketTitleSchema } from "./ticket.ts";

// The inputs and the outputs of the ticket writes: create, update, move,
// the two batch writes, and delete.

// One write names at most 50 labels. A ticket holds one label of a group at
// most, so two labels of one group in one list fail INPUT_VALIDATION_FAILED.
const LabelRefListSchema = z.array(LabelRefStringSchema).max(50, "Enter 50 labels or less.");

const TicketDependencyListSchema = z
	.array(TicketRefStringSchema)
	.min(1, "Name one ticket at least.")
	.max(200, "Name 200 tickets or less.")
	.refine((refs) => new Set(refs).size === refs.length, "Name each ticket once.");

const ContractLineSchema = z.string().min(1, "Enter a contract line.");
const ContractListSchema = z.array(ContractLineSchema).max(200, "Enter 200 contract lines or less.");

export const TicketContractInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	result: z.string(),
	files: ContractListSchema,
	leaveAlone: ContractListSchema,
	verify: ContractListSchema,
	reviewFocus: ContractListSchema,
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketContractInput = z.input<typeof TicketContractInputSchema>;

export const TicketImportContractInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
});

export const TicketImportContractOutputSchema = z.object({
	filledCount: CountSchema,
	unresolved: z.array(z.object({ ticket: TicketIdentifierSchema, line: z.string() })),
});
export type TicketImportContractOutput = z.infer<typeof TicketImportContractOutputSchema>;

let sentenceSegmenter: Intl.Segmenter | undefined;
const oneSentence = (text: string) => {
	sentenceSegmenter ??= new Intl.Segmenter("en", { granularity: "sentence" });
	return [...sentenceSegmenter.segment(text)].length === 1;
};
export const TicketOutcomeInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	outcome: z.string().trim().min(1, "Enter an outcome.").refine(oneSentence, "Enter one sentence."),
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketOutcomeInput = z.input<typeof TicketOutcomeInputSchema>;

// `status` defaults to the project's default status; `description` to the
// project's ticket template. `epic` names an epic of the same root.
// `after` names the tickets that the new ticket waits for.
// `wave` names a wave of the same root and places the ticket in
// the epic of that wave. With `epic` and `wave` together, the
// wave must belong to that epic (WAVE_OUTSIDE_EPIC).
export const TicketCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	title: TicketTitleSchema,
	description: z.string().optional(),
	priority: PrioritySchema.optional(),
	status: StatusRefStringSchema.optional(),
	parent: TicketRefStringSchema.optional(),
	epic: EpicRefStringSchema.optional(),
	wave: WaveRefStringSchema.optional(),
	labels: LabelRefListSchema.optional(),
	after: TicketDependencyListSchema.optional(),
});
export type TicketCreateInput = z.input<typeof TicketCreateInputSchema>;

export const TicketImportDependenciesInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
});

export const TicketImportDependenciesOutputSchema = z.object({
	edgeCount: CountSchema,
	ticketsWithUnresolvedReferences: z.array(TicketIdentifierSchema),
});
export type TicketImportDependenciesOutput = z.infer<typeof TicketImportDependenciesOutputSchema>;

// `after` names the tickets that this ticket waits for. `notAfter` removes
// those waits. `expectedVersion` makes both changes conditional.
export const TicketUpdateDependenciesInputSchema = z
	.strictObject({
		ticket: TicketRefStringSchema,
		after: TicketDependencyListSchema.optional(),
		notAfter: TicketDependencyListSchema.optional(),
		expectedVersion: z.number().int().positive().optional(),
	})
	.refine((input) => input.after !== undefined || input.notAfter !== undefined, "Name a dependency to add or remove.")
	.refine(
		(input) =>
			input.after === undefined ||
			input.notAfter === undefined ||
			!input.after.some((ref) => input.notAfter?.includes(ref)),
		"Do not add and remove the same dependency.",
	);

// `expectedVersion` makes the write conditional: a mismatch is
// VERSION_CONFLICT with the current row. `parent: null` clears the parent,
// and `epic: null` clears the epic. `wave` places the ticket in the
// epic of that wave in the same write, and `wave: null` clears the
// wave. An `epic` value that differs from the current epic, or
// `epic: null`, clears the wave. `addLabels` and `removeLabels` change the
// label set one label at a time, so two writers do not overwrite the labels
// of each other. A label the ticket holds already, or a removed label it does
// not hold, changes nothing. An added label of a group replaces the label of
// that group on the ticket.
export const TicketUpdateInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	title: TicketTitleSchema.optional(),
	description: z.string().optional(),
	priority: PrioritySchema.optional(),
	status: StatusRefStringSchema.optional(),
	parent: TicketRefStringSchema.nullable().optional(),
	epic: EpicRefStringSchema.nullable().optional(),
	wave: WaveRefStringSchema.nullable().optional(),
	project: ProjectRefStringSchema.optional(),
	addLabels: LabelRefListSchema.optional(),
	removeLabels: LabelRefListSchema.optional(),
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketUpdateInput = z.input<typeof TicketUpdateInputSchema>;

// `after` and `before` must sit in the target column.
export const TicketMoveInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	status: StatusRefStringSchema,
	after: TicketRefStringSchema.optional(),
	before: TicketRefStringSchema.optional(),
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketMoveInput = z.input<typeof TicketMoveInputSchema>;

// A batch is one transaction of at most 200 tickets. Each ref arrives in its
// canonical spelling, `CDE-1` for `cde-1`, and the batch refuses two refs
// that hold the same canonical spelling. A ULID and a `KEY-n` are two
// spellings of one ticket, so a batch that holds both passes this check and
// writes to that ticket twice.
const TicketBatchSchema = z
	.array(TicketRefStringSchema)
	.min(1)
	.max(200)
	.refine((refs) => new Set(refs).size === refs.length, "Name each ticket once.");

export const TicketUpdateManyInputSchema = z.strictObject({
	tickets: TicketBatchSchema,
	status: StatusRefStringSchema.optional(),
	priority: PrioritySchema.optional(),
	project: ProjectRefStringSchema.optional(),
	parent: TicketRefStringSchema.nullable().optional(),
	epic: EpicRefStringSchema.nullable().optional(),
	wave: WaveRefStringSchema.nullable().optional(),
	addLabels: LabelRefListSchema.optional(),
	removeLabels: LabelRefListSchema.optional(),
});
export type TicketUpdateManyInput = z.input<typeof TicketUpdateManyInputSchema>;

export const TicketUpdateManyOutputSchema = z.object({
	items: z.array(TicketSummarySchema),
});

export const TicketDeleteManyInputSchema = z.strictObject({
	tickets: TicketBatchSchema,
	force: z.boolean().optional(),
});
export type TicketDeleteManyInput = z.input<typeof TicketDeleteManyInputSchema>;

export const TicketDeleteManyOutputSchema = z.object({
	deleted: z.array(TicketIdentifierSchema),
});

export const TicketDeleteInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	force: booleanString.optional(),
});
export type TicketDeleteInput = z.input<typeof TicketDeleteInputSchema>;

export const TicketDeleteOutputSchema = z.object({
	deleted: TicketIdentifierSchema,
});
