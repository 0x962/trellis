import {
	type Provider,
	ProviderCheckDraftInputSchema,
	ProviderCreateInputSchema,
	ProviderUpdateInputSchema,
} from "@trellis/api";
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

export function providerCheckInput(value: ProviderFormValue, provider?: Provider) {
	if (provider && value.apiKey.trim() === "" && value.baseUrl.trim() === provider.baseUrl) {
		return { source: "stored" as const, input: { id: provider.id, refresh: true } };
	}
	const draft = ProviderCheckDraftInputSchema.safeParse({
		kind: value.kind,
		apiKey: value.apiKey,
		...(value.kind === "openai-compatible" || provider ? { baseUrl: value.baseUrl } : {}),
	});
	return draft.success ? { source: "draft" as const, input: draft.data } : undefined;
}

export const providerCredentialsChanged = (before: ProviderFormValue, after: ProviderFormValue) =>
	before.kind !== after.kind || before.apiKey !== after.apiKey || before.baseUrl !== after.baseUrl;

export const providerFormDirty = (value: ProviderFormValue, provider: Provider) =>
	value.name.trim() !== provider.name ||
	(value.kind === "openai-compatible" && value.baseUrl.trim() !== provider.baseUrl) ||
	value.apiKey.trim() !== "" ||
	value.enabled !== provider.enabled ||
	[...value.models].sort().join("\n") !== [...provider.models].sort().join("\n");
