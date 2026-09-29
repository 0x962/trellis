import { sql } from "drizzle-orm";
import { z } from "zod";
import { rows } from "../../../db/queries/support.ts";
import type { ServiceCtx } from "../../support.ts";
import type { ProviderFetch } from "../remote.ts";
import { keyOf } from "../secret.ts";

export type ProviderTextMessage = {
	role: "user" | "assistant";
	content: string;
};

export type ProviderTextGenerationInput = {
	providerId: string;
	model: string;
	systemInstruction: string;
	messages: readonly ProviderTextMessage[];
	signal: AbortSignal;
};

export type ProviderTextUsage = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number | null;
	cachedInputTokens: number | null;
	reasoningOutputTokens: number | null;
};

export type ProviderTextGeneration = {
	text: string;
	responseId: string;
	responseModel: string;
	usage: ProviderTextUsage;
};

export type ProviderGenerationFailureCode =
	| "PROVIDER_UNAVAILABLE"
	| "PROVIDER_REQUEST_CANCELED"
	| "PROVIDER_UNREACHABLE"
	| "PROVIDER_CONTEXT_CAPACITY"
	| "PROVIDER_HTTP_ERROR"
	| "PROVIDER_INVALID_RESPONSE";

export class ProviderGenerationError extends Error {
	constructor(
		readonly code: ProviderGenerationFailureCode,
		message: string,
		readonly status: number | null = null,
	) {
		super(message);
		this.name = "ProviderGenerationError";
	}
}

const responseSchema = z.object({
	id: z.string(),
	model: z.string(),
	output: z.array(
		z.object({
			type: z.string(),
			role: z.string().optional(),
			content: z
				.array(
					z.object({
						type: z.string(),
						text: z.string().optional(),
					}),
				)
				.optional(),
		}),
	),
	usage: z.object({
		input_tokens: z.number().int().nonnegative(),
		output_tokens: z.number().int().nonnegative(),
		total_tokens: z.number().int().nonnegative().optional(),
		input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).optional(),
		output_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().optional() }).optional(),
	}),
});

type StoredProvider = { id: string; baseUrl: string; apiKey: string };

const loadProvider = async (
	ctx: Pick<ServiceCtx, "newTx">,
	input: Pick<ProviderTextGenerationInput, "providerId" | "model">,
): Promise<StoredProvider> =>
	ctx.newTx(async (tx) => {
		const [provider] = await rows<{ id: string; base_url: string }>(
			tx,
			sql`
				SELECT p.id, p.base_url
				FROM providers p
				WHERE p.id = ${input.providerId}
					AND p.enabled
					AND p.kind = 'vercel-ai-gateway'
					AND EXISTS (
						SELECT 1 FROM provider_models m
						WHERE m.provider_id = p.id AND m.model_id = ${input.model}
					)
			`,
		);
		if (!provider) {
			throw new ProviderGenerationError(
				"PROVIDER_UNAVAILABLE",
				`The selected Vercel provider is unavailable for ${input.model}.`,
			);
		}
		return { id: provider.id, baseUrl: provider.base_url, apiKey: await keyOf(tx, provider.id) };
	});

const httpError = (status: number) => {
	if (status === 401) return "The Vercel provider refused its key.";
	if (status === 403) return "The Vercel provider refused the text request.";
	if (status === 429) return "The Vercel provider rate limit stopped the text request.";
	return `The Vercel provider text request failed with HTTP ${status}.`;
};

const providerErrorSchema = z.object({
	error: z.object({ type: z.string().optional(), code: z.string().optional() }),
});

const isContextCapacityError = async (response: Response) => {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return false;
	}
	const parsed = providerErrorSchema.safeParse(body);
	if (!parsed.success) return false;
	return [parsed.data.error.type, parsed.data.error.code].includes("context_length_exceeded");
};

export async function generateText(
	ctx: Pick<ServiceCtx, "newTx" | "log">,
	input: ProviderTextGenerationInput,
	fetcher: ProviderFetch = fetch,
): Promise<ProviderTextGeneration> {
	const provider = await loadProvider(ctx, input);
	const fields = { providerId: provider.id, host: new URL(provider.baseUrl).host, model: input.model };
	ctx.log("provider.generate.request", fields);

	let response: Response;
	try {
		response = await fetcher(`${provider.baseUrl}/v1/responses`, {
			method: "POST",
			headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
			redirect: "manual",
			signal: input.signal,
			body: JSON.stringify({
				model: input.model,
				instructions: input.systemInstruction,
				input: input.messages.map((message) => ({ type: "message", ...message })),
			}),
		});
	} catch {
		const canceled = input.signal.aborted;
		const error = new ProviderGenerationError(
			canceled ? "PROVIDER_REQUEST_CANCELED" : "PROVIDER_UNREACHABLE",
			canceled ? "The provider text request was canceled." : `Trellis cannot reach ${fields.host}.`,
		);
		ctx.log("provider.generate.failure", { ...fields, status: null, code: error.code });
		throw error;
	}

	if (!response.ok) {
		const contextCapacity = await isContextCapacityError(response);
		const error = new ProviderGenerationError(
			contextCapacity ? "PROVIDER_CONTEXT_CAPACITY" : "PROVIDER_HTTP_ERROR",
			contextCapacity
				? "The provider context capacity is too small for this text request."
				: httpError(response.status),
			response.status,
		);
		ctx.log("provider.generate.failure", { ...fields, status: response.status, code: error.code });
		throw error;
	}

	let parsed: z.infer<typeof responseSchema>;
	try {
		parsed = responseSchema.parse(await response.json());
	} catch {
		const error = new ProviderGenerationError(
			"PROVIDER_INVALID_RESPONSE",
			"The Vercel provider returned an invalid text response.",
		);
		ctx.log("provider.generate.failure", { ...fields, status: response.status, code: error.code });
		throw error;
	}

	const blocks = parsed.output.flatMap((item) =>
		item.type === "message" && item.role === "assistant"
			? (item.content ?? []).filter(
					(block): block is typeof block & { text: string } => block.type === "output_text" && block.text !== undefined,
				)
			: [],
	);
	if (blocks.length === 0) {
		const error = new ProviderGenerationError(
			"PROVIDER_INVALID_RESPONSE",
			"The Vercel provider returned an invalid text response.",
		);
		ctx.log("provider.generate.failure", { ...fields, status: response.status, code: error.code });
		throw error;
	}

	const usage: ProviderTextUsage = {
		inputTokens: parsed.usage.input_tokens,
		outputTokens: parsed.usage.output_tokens,
		totalTokens: parsed.usage.total_tokens ?? null,
		cachedInputTokens: parsed.usage.input_tokens_details?.cached_tokens ?? null,
		reasoningOutputTokens: parsed.usage.output_tokens_details?.reasoning_tokens ?? null,
	};
	ctx.log("provider.generate.result", { ...fields, status: response.status, ...usage });
	return {
		text: blocks.map((block) => block.text).join(""),
		responseId: parsed.id,
		responseModel: parsed.model,
		usage,
	};
}
