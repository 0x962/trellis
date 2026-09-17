import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { ColorTokenSchema } from "./enums.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const LabelNameSchema = z.string().trim().min(1).max(80);

export const LabelSchema = z.object({
	id: UlidSchema,
	groupId: UlidSchema,
	name: LabelNameSchema,
	color: ColorTokenSchema,
	position: z.number().int().nonnegative(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Label = z.infer<typeof LabelSchema>;

export const LabelGroupSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	name: LabelNameSchema,
	position: z.number().int().nonnegative(),
	labels: z.array(LabelSchema),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type LabelGroup = z.infer<typeof LabelGroupSchema>;

export const LabelGroupListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

export const LabelGroupListOutputSchema = z.object({
	groups: z.array(LabelGroupSchema),
});
export type LabelGroupListOutput = z.infer<typeof LabelGroupListOutputSchema>;

export const LabelGroupCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	name: LabelNameSchema,
});
export type LabelGroupCreateInput = z.input<typeof LabelGroupCreateInputSchema>;

export const LabelCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	group: UlidSchema,
	name: LabelNameSchema,
	color: ColorTokenSchema.optional(),
});
export type LabelCreateInput = z.input<typeof LabelCreateInputSchema>;
