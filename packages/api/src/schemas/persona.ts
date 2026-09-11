import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const PersonaKindSchema = z.enum(["builder", "reviewer", "manager"]);
export type PersonaKind = z.infer<typeof PersonaKindSchema>;

export const PersonaCreateInputSchema = z.strictObject({
	name: z.string().trim().min(1).max(120),
	kind: PersonaKindSchema.optional(),
	instruction: z.string().trim().min(1).max(200_000),
});
export type PersonaCreateInput = z.input<typeof PersonaCreateInputSchema>;

export const PersonaUpdateInputSchema = PersonaCreateInputSchema.extend({ id: UlidSchema });
export type PersonaUpdateInput = z.input<typeof PersonaUpdateInputSchema>;

export const PersonaSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	kind: PersonaKindSchema,
	instruction: z.string(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Persona = z.infer<typeof PersonaSchema>;

export const PersonaDeleteInputSchema = z.strictObject({ id: UlidSchema });
