import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const AccountHarnessSchema = z.enum(["claude", "codex", "opencode", "pi", "muse"]);
export type AccountHarness = z.infer<typeof AccountHarnessSchema>;
export const HarnessAccountSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	harness: AccountHarnessSchema,
	profilePath: z.string(),
	isDefault: z.boolean(),
	loginCommand: z.string().nullable(),
	capabilities: z.object({
		launch: z.boolean(),
		resumeWithAccount: z.boolean(),
		quota: z.boolean(),
		detail: z.string().nullable(),
	}),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type HarnessAccount = z.infer<typeof HarnessAccountSchema>;
export const HarnessAccountCreateSchema = z.strictObject({
	name: z
		.string()
		.trim()
		.min(1, "Enter an account name of 1 to 120 characters.")
		.max(120, "Enter an account name of 1 to 120 characters."),
	harness: AccountHarnessSchema,
	profilePath: z
		.string()
		.trim()
		.min(1, "Enter a profile directory path, or omit it.")
		.optional()
		.describe("Existing profile directory. Omit to create a separate login profile."),
});
export type HarnessAccountCreate = z.infer<typeof HarnessAccountCreateSchema>;
export const HarnessAccountUpdateSchema = z.strictObject({
	id: UlidSchema,
	name: z
		.string()
		.trim()
		.min(1, "Enter an account name of 1 to 120 characters.")
		.max(120, "Enter an account name of 1 to 120 characters.")
		.optional(),
	isDefault: z.boolean().optional(),
});
export type HarnessAccountUpdate = z.infer<typeof HarnessAccountUpdateSchema>;
export const HarnessAccountQuotaSchema = z.object({
	accountId: UlidSchema,
	status: z.enum(["ok", "unlimited", "metered", "signed_out", "stale", "expired", "unavailable"]),
	email: z.string().nullable(),
	plan: z.string().nullable(),
	detail: z.string().nullable(),
	windows: z.array(
		z.object({ id: z.string(), label: z.string(), usedPercent: z.number(), resetsAt: IsoDateTimeSchema.nullable() }),
	),
	creditsBalance: z.number().nullable(),
	extraUsage: z.object({ usedCents: z.number(), limitCents: z.number() }).nullable(),
	fetchedAt: IsoDateTimeSchema,
});
export type HarnessAccountQuota = z.infer<typeof HarnessAccountQuotaSchema>;
