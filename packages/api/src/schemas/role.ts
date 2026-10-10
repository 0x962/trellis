import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const RoleNameSchema = z.string().trim().min(1, "Enter a name.");
export const RoleSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	body: z.string(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Role = z.infer<typeof RoleSchema>;
export const RoleIdInputSchema = z.strictObject({ id: UlidSchema });
export const RoleCreateInputSchema = z.strictObject({ name: RoleNameSchema, body: z.string() });
export type RoleCreateInput = z.input<typeof RoleCreateInputSchema>;
export const RoleUpdateInputSchema = z.strictObject({
	id: UlidSchema,
	name: RoleNameSchema.optional(),
	body: z.string().optional(),
});
