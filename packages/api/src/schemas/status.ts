import { z } from "zod";
import { ProjectRefStringSchema, StatusRefStringSchema } from "../refs.ts";
import { ColorTokenSchema, ReviewerSchema, StatusCategorySchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, slugPattern, UlidSchema } from "./primitives.ts";

const StatusNameSchema = z
	.string()
	.min(1, "Enter a status name of 1 to 40 characters.")
	.max(40, "Enter a status name of 1 to 40 characters.");

// A status slug is the name in slug form. The reserved project slugs (`board`,
// `settings`) are web routes under a project path. A status is never a route
// segment, so a status named Settings keeps its slug.
const StatusSlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.");

// `color` is a token name from packages/ui, never a raw color value.
const ColorSchema = ColorTokenSchema;

// Markdown that tells the manager agent what to do with a ticket in this
// status. The manager reads every description of the set at start and on
// `statuses.changed`, so a new status needs no code change.
const StatusDescriptionSchema = z.string().max(2000, "Enter a status description of 2000 characters or less.");

// The most tickets a status holds at one time. Null means no limit.
const WipLimitSchema = z
	.number()
	.int("Enter a whole number for the WIP limit.")
	.positive("Enter a WIP limit of 1 or more.");

// The status fields every ticket row carries.
export const StatusSummarySchema = z.object({
	id: UlidSchema,
	slug: StatusSlugSchema,
	name: StatusNameSchema,
	category: StatusCategorySchema,
	reviewer: ReviewerSchema.nullable(),
	color: ColorSchema,
});
export type StatusSummary = z.infer<typeof StatusSummarySchema>;

export const StatusSchema = StatusSummarySchema.extend({
	projectId: UlidSchema,
	description: StatusDescriptionSchema.default(""),
	position: z.number().int(),
	wipLimit: WipLimitSchema.nullable(),
	isDefault: z.boolean(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Status = z.infer<typeof StatusSchema>;

// `inheritedFrom` names the ancestor that owns the set, or null when the
// project owns its own statuses.
export const StatusListOutputSchema = z.object({
	statuses: z.array(StatusSchema),
	inheritedFrom: UlidSchema.nullable(),
});
export type StatusListOutput = z.infer<typeof StatusListOutputSchema>;

export const StatusListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

// A review status names who reviews; every other category carries no reviewer.
const reviewerMatchesCategory = (input: { category: string; reviewer?: string | undefined }) =>
	(input.category === "review") === (input.reviewer !== undefined);

export const StatusCreateInputSchema = z
	.strictObject({
		project: ProjectRefStringSchema,
		name: StatusNameSchema,
		category: StatusCategorySchema,
		reviewer: ReviewerSchema.optional(),
		description: StatusDescriptionSchema.optional(),
		color: ColorSchema.optional(),
		position: z.number().int().optional(),
		wipLimit: WipLimitSchema.optional(),
		isDefault: z.boolean().optional(),
	})
	.refine(reviewerMatchesCategory, "A review status needs a reviewer; another category cannot carry one.");
export type StatusCreateInput = z.input<typeof StatusCreateInputSchema>;

// `category` is immutable after creation, so it is not an update field.
export const StatusUpdateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	status: StatusRefStringSchema,
	name: StatusNameSchema.optional(),
	description: StatusDescriptionSchema.optional(),
	color: ColorSchema.optional(),
	reviewer: ReviewerSchema.optional(),
	wipLimit: WipLimitSchema.nullable().optional(),
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

export const StatusClearInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

// After a clear the project inherits again; `remapped` counts the tickets
// moved onto the inherited set.
export const StatusClearOutputSchema = z.object({
	inheritedFrom: UlidSchema,
	remapped: CountSchema,
});
