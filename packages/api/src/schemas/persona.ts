import { z } from "zod";
import { ColorTokenSchema } from "./enums.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const PersonaKindSchema = z.enum(["builder", "reviewer", "manager"]);
export type PersonaKind = z.infer<typeof PersonaKindSchema>;

export const PersonaCreateInputSchema = z.strictObject({
	name: z
		.string()
		.trim()
		.min(1, "Enter a persona name of 1 to 120 characters.")
		.max(120, "Enter a persona name of 1 to 120 characters."),
	kind: PersonaKindSchema.optional(),
	// A palette token name, never a raw color value. A raw value has no dark
	// variant, so the wire never carries one.
	color: ColorTokenSchema.optional(),
	description: z.string().trim().max(2000, "Enter a description of 2,000 characters or less.").optional(),
	instruction: z
		.string()
		.trim()
		.min(1, "Enter an instruction of 1 to 200,000 characters.")
		.max(200_000, "Enter an instruction of 1 to 200,000 characters."),
});
export type PersonaCreateInput = z.input<typeof PersonaCreateInputSchema>;

export const PersonaUpdateInputSchema = PersonaCreateInputSchema.extend({ id: UlidSchema });
export type PersonaUpdateInput = z.input<typeof PersonaUpdateInputSchema>;

export const PersonaSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	kind: PersonaKindSchema,
	color: ColorTokenSchema,
	description: z.string(),
	instruction: z.string(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Persona = z.infer<typeof PersonaSchema>;

export const PersonaIdInputSchema = z.strictObject({ id: UlidSchema });
export const PersonaDeleteInputSchema = PersonaIdInputSchema;
