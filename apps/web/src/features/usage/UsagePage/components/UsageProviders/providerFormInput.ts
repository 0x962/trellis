import { type Provider, ProviderCreateInputSchema, ProviderUpdateInputSchema } from "@trellis/api";
import type { ProviderFormValue } from "@trellis/ui";

export const initialProviderValue = (provider?: Provider): ProviderFormValue => ({
	name: provider?.name ?? "",
	kind: provider?.kind ?? "vercel-ai-gateway",
	baseUrl: provider?.baseUrl ?? "",
	apiKey: "",
	models: provider?.models ?? [],
	enabled: provider?.enabled ?? true,
});

export function providerFormInput(value: ProviderFormValue, provider?: Provider) {
	const fields = {
		name: value.name,
		...(value.kind === "openai-compatible" ? { baseUrl: value.baseUrl } : {}),
		enabled: value.enabled,
		models: value.models,
	};
	return provider
		? ProviderUpdateInputSchema.safeParse({
				id: provider.id,
				...fields,
				...(value.apiKey.trim() ? { apiKey: value.apiKey } : {}),
			})
		: ProviderCreateInputSchema.safeParse({ ...fields, kind: value.kind, apiKey: value.apiKey });
}

export const providerFormDirty = (value: ProviderFormValue, provider: Provider) =>
	value.name.trim() !== provider.name ||
	(value.kind === "openai-compatible" && value.baseUrl.trim() !== provider.baseUrl) ||
	value.apiKey.trim() !== "" ||
	value.enabled !== provider.enabled ||
	[...value.models].sort().join("\n") !== [...provider.models].sort().join("\n");
