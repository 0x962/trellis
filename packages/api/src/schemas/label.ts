import { z } from "zod";
import { LabelGroupRefStringSchema, ProjectRefStringSchema } from "../refs.ts";
import { LabelColorSchema } from "./enums.ts";
import { booleanString, CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// A name is stored trimmed. A comma separates the refs of a list filter, and
// a slash separates the group from the label in a `group/name` ref, so a name
// holds neither. `none` is the list filter value for a ticket with no label,
// so no label and no group takes that name. `noun` is the word the messages use.
const nameSchema = (noun: "label" | "group") =>
	z
		.string()
		.trim()
		.min(1, `Enter a ${noun} name of 1 to 80 characters.`)
		.max(80, `Enter a ${noun} name of 1 to 80 characters.`)
		.regex(/^[^,/]*$/, `A ${noun} name cannot contain a comma or a slash.`)
		.refine((name) => name.toLowerCase() !== "none", `A ${noun} cannot take the name "none".`);

export const LabelNameSchema = nameSchema("label");
export const LabelGroupNameSchema = nameSchema("group");

// Plain text that states when to use the label.
export const LabelDescriptionSchema = z
	.string()
	.trim()
	.max(255, "Enter a label description of 255 characters or less.");

// A project owns its labels and its label groups, so `projectId` is the id
// of that project. `groupId` is null for a label with no group. `ticketCount` is the number of tickets that hold the label.
export const LabelSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	groupId: UlidSchema.nullable(),
	name: LabelNameSchema,
	color: LabelColorSchema,
	description: LabelDescriptionSchema,
	ticketCount: CountSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Label = z.infer<typeof LabelSchema>;

// A ticket holds one label of a group at most.
export const LabelGroupSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	name: LabelGroupNameSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type LabelGroup = z.infer<typeof LabelGroupSchema>;

// The label fields every ticket row carries. `group` is the name of the
// label's group, and null for a label with no group.
export const TicketLabelSchema = z.object({
	id: UlidSchema,
	name: LabelNameSchema,
	color: LabelColorSchema,
	group: LabelGroupNameSchema.nullable(),
});
export type TicketLabel = z.infer<typeof TicketLabelSchema>;

export const LabelListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

// Each list is in name order, without regard to case. `labels` holds the
// labels of every group and the labels with no group.
export const LabelListOutputSchema = z.object({
	groups: z.array(LabelGroupSchema),
	labels: z.array(LabelSchema),
});
export type LabelListOutput = z.infer<typeof LabelListOutputSchema>;

// `color` defaults to a hue that no label of the tree uses. `group` is the
// ULID or the name of a label group.
export const LabelCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	name: LabelNameSchema,
	color: LabelColorSchema.optional(),
	description: LabelDescriptionSchema.optional(),
	group: LabelGroupRefStringSchema.optional(),
});
export type LabelCreateInput = z.input<typeof LabelCreateInputSchema>;

// `group: null` takes the label out of its group. A move into a group is
// LABEL_GROUP_CONFLICT when a ticket holds the label and another label of
// that group.
export const LabelUpdateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	label: UlidSchema,
	name: LabelNameSchema.optional(),
	color: LabelColorSchema.optional(),
	description: LabelDescriptionSchema.optional(),
	group: LabelGroupRefStringSchema.nullable().optional(),
});
export type LabelUpdateInput = z.input<typeof LabelUpdateInputSchema>;

export const LabelDeleteInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	label: UlidSchema,
	force: booleanString.optional(),
});
export type LabelDeleteInput = z.input<typeof LabelDeleteInputSchema>;

// `tickets` counts the tickets that held the label.
export const LabelDeleteOutputSchema = z.object({
	deleted: UlidSchema,
	tickets: CountSchema,
});

export const LabelGroupCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	name: LabelGroupNameSchema,
});
export type LabelGroupCreateInput = z.input<typeof LabelGroupCreateInputSchema>;

export const LabelGroupUpdateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	group: UlidSchema,
	name: LabelGroupNameSchema,
});
export type LabelGroupUpdateInput = z.input<typeof LabelGroupUpdateInputSchema>;

// `labels` states what happens to the labels of the group: `ungroup` keeps
// them as labels with no group, and `delete` deletes them from every ticket.
// `ungroup` fails with DUPLICATE when a label of the group has the name of a
// label with no group, or the name of another group.
export const LabelGroupDeleteInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	group: UlidSchema,
	labels: z.enum(["ungroup", "delete"]),
	force: booleanString.optional(),
});
export type LabelGroupDeleteInput = z.input<typeof LabelGroupDeleteInputSchema>;

// One of the two counts is zero: `ungrouped` counts the labels that lost the
// group, and `deletedLabels` counts the labels deleted with the group.
export const LabelGroupDeleteOutputSchema = z.object({
	deleted: UlidSchema,
	ungrouped: CountSchema,
	deletedLabels: CountSchema,
});
