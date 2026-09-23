import { z } from "zod";
import { ProjectRefStringSchema, StatusRefStringSchema } from "../refs.ts";
import { ColorTokenSchema, StatusCategorySchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, slugPattern, UlidSchema } from "./primitives.ts";

const StatusNameSchema = z
	.string()
	.min(1, "Enter a status name of 1 to 40 characters.")
	.max(40, "Enter a status name of 1 to 40 characters.");

// A status slug is the name in slug form. The reserved project slugs (`board`,
// `settings`) are web routes under a project URL. A status is never a route
// segment, so a status named Settings keeps its slug.
const StatusSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// `color` is a token name from packages/ui, never a raw color value.
const ColorSchema = ColorTokenSchema;

// Markdown that describes what the status means.
const StatusDescriptionSchema = z.string().max(2000, "Enter a status description of 2000 characters or less.");

// The status fields every ticket row carries.
export const StatusSummarySchema = z.object({
	id: UlidSchema,
	slug: StatusSlugSchema,
	name: StatusNameSchema,
	category: StatusCategorySchema,
	color: ColorSchema,
});
export type StatusSummary = z.infer<typeof StatusSummarySchema>;

export const StatusSchema = StatusSummarySchema.extend({
	projectId: UlidSchema,
	description: StatusDescriptionSchema.default(""),
	position: z.number().int(),
	isDefault: z.boolean(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Status = z.infer<typeof StatusSchema>;

// The status set of one project, in position order.
export const StatusListOutputSchema = z.object({
	statuses: z.array(StatusSchema),
});
export type StatusListOutput = z.infer<typeof StatusListOutputSchema>;

export const StatusListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

export const StatusCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	name: StatusNameSchema,
	category: StatusCategorySchema,
	description: StatusDescriptionSchema.optional(),
	color: ColorSchema.optional(),
	position: z.number().int().optional(),
	isDefault: z.boolean().optional(),
});
export type StatusCreateInput = z.input<typeof StatusCreateInputSchema>;

// `category` is immutable after creation, so it is not an update field.
export const StatusUpdateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	status: StatusRefStringSchema,
	name: StatusNameSchema.optional(),
	description: StatusDescriptionSchema.optional(),
	color: ColorSchema.optional(),
	isDefault: z.boolean().optional(),
});
export type StatusUpdateInput = z.input<typeof StatusUpdateInputSchema>;

export const StatusReorderInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	statuses: z.array(StatusRefStringSchema).min(1),
});

// `moveTo` receives the tickets of the deleted status and must belong to the
// same project.
export const StatusDeleteInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	status: StatusRefStringSchema,
	moveTo: StatusRefStringSchema.optional(),
	force: z.boolean().optional(),
});

export const StatusDeleteOutputSchema = z.object({
	deleted: UlidSchema,
	moved: CountSchema,
});
