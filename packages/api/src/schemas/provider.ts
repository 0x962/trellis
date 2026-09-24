import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const providerKinds = ["vercel-ai-gateway", "openai-compatible"] as const;

const KIND_MESSAGE = "Choose Vercel AI Gateway or an OpenAI-compatible endpoint.";
const BASE_URL_MESSAGE = "Enter the https address of the endpoint, without /v1.";
const MODEL_ID_MESSAGE =
	"Enter the model id as the endpoint names it, such as anthropic/claude-opus-5 or qwen2.5-coder:7b.";

export const ProviderKindSchema = z.enum(providerKinds, { error: KIND_MESSAGE });
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderModelIdSchema = z
	.string()
	.min(1, MODEL_ID_MESSAGE)
	.max(200, MODEL_ID_MESSAGE)
	.regex(/^[^\s\p{Cc}]+$/u, MODEL_ID_MESSAGE);
export type ProviderModelId = z.infer<typeof ProviderModelIdSchema>;

const ProviderNameSchema = z
	.string()
	.trim()
	.min(1, "Enter a provider name of 1 to 120 characters.")
	.max(120, "Enter a provider name of 1 to 120 characters.");

const ProviderBaseUrlSchema = z
	.string()
	.trim()
	.max(2000, BASE_URL_MESSAGE)
	.url(BASE_URL_MESSAGE)
	.refine((value) => {
		const url = URL.parse(value);
		// URL.search and URL.hash are empty for a final question mark or number sign.
		// The stored base URL must accept appended endpoint paths, so the input cannot contain either delimiter.
		return (
			url?.protocol === "https:" &&
			url.username === "" &&
			url.password === "" &&
			url.search === "" &&
			url.hash === "" &&
			!value.includes("?") &&
			!value.includes("#")
		);
	}, BASE_URL_MESSAGE);

const ProviderApiKeySchema = z
	.string()
	.trim()
	.min(1, "Paste the API key of the provider.")
	.max(4000, "Paste the API key of the provider.");

const ProviderModelIdsSchema = z
	.array(ProviderModelIdSchema)
	.max(200, "A provider offers at most 200 models.")
	.refine((models) => new Set(models).size === models.length, "Name each model once.");

export const ProviderSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	kind: ProviderKindSchema,
	baseUrl: z.string(),
	keyLast4: z.string().refine((value) => value === "" || value.length === 4),
	enabled: z.boolean(),
	models: z.array(ProviderModelIdSchema),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Provider = z.infer<typeof ProviderSchema>;

export const ProviderCreateInputSchema = z
	.strictObject({
		name: ProviderNameSchema,
		kind: ProviderKindSchema,
		baseUrl: ProviderBaseUrlSchema.optional(),
		apiKey: ProviderApiKeySchema,
		enabled: z.boolean().default(true),
		models: ProviderModelIdsSchema.default([]),
	})
	.superRefine((input, ctx) => {
		if (input.kind === "openai-compatible" && input.baseUrl === undefined)
			ctx.addIssue({ code: "custom", path: ["baseUrl"], message: BASE_URL_MESSAGE });
	})
	.transform((input) => ({
		...input,
		baseUrl: input.baseUrl ?? "https://ai-gateway.vercel.sh",
	}));
export type ProviderCreateInput = z.input<typeof ProviderCreateInputSchema>;
export type ParsedProviderCreateInput = z.infer<typeof ProviderCreateInputSchema>;

export const ProviderUpdateInputSchema = z.strictObject({
	id: UlidSchema,
	name: ProviderNameSchema.optional(),
	baseUrl: ProviderBaseUrlSchema.optional(),
	apiKey: ProviderApiKeySchema.optional(),
	enabled: z.boolean().optional(),
	models: ProviderModelIdsSchema.optional(),
});
export type ProviderUpdateInput = z.input<typeof ProviderUpdateInputSchema>;
export type ParsedProviderUpdateInput = z.infer<typeof ProviderUpdateInputSchema>;

export const ProviderIdInputSchema = z.strictObject({ id: UlidSchema });
export type ProviderIdInput = z.infer<typeof ProviderIdInputSchema>;

export const ProviderRemoteInputSchema = z.strictObject({ id: UlidSchema, refresh: z.boolean().optional() });
export type ProviderRemoteInput = z.infer<typeof ProviderRemoteInputSchema>;
export const ProviderPublicModelsInputSchema = z.strictObject({
	kind: ProviderKindSchema,
	refresh: z.boolean().optional(),
});
export type ProviderPublicModelsInput = z.infer<typeof ProviderPublicModelsInputSchema>;

export const ProviderModelEntrySchema = z.strictObject({
	id: ProviderModelIdSchema,
	name: z.string(),
	type: z.literal("language"),
});
export type ProviderModelEntry = z.infer<typeof ProviderModelEntrySchema>;

export const ProviderModelsSchema = z.discriminatedUnion("ok", [
	z.strictObject({
		ok: z.literal(true),
		detail: z.null(),
		fetchedAt: IsoDateTimeSchema,
		models: z.array(ProviderModelEntrySchema),
	}),
	z.strictObject({
		ok: z.literal(false),
		detail: z.string().min(1),
		fetchedAt: IsoDateTimeSchema,
		models: z.array(z.never()),
	}),
]);
export type ProviderModels = z.infer<typeof ProviderModelsSchema>;

export const ProviderCheckSchema = z.discriminatedUnion("ok", [
	z.strictObject({
		ok: z.literal(true),
		balance: z.string().nullable(),
		detail: z.null(),
		checkedAt: IsoDateTimeSchema,
	}),
	z.strictObject({
		ok: z.literal(false),
		balance: z.null(),
		detail: z.string().min(1),
		checkedAt: IsoDateTimeSchema,
	}),
]);
export type ProviderCheck = z.infer<typeof ProviderCheckSchema>;
