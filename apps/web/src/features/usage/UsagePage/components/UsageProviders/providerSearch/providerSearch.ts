import type { Provider } from "@trellis/api";

export function filterProviders(providers: readonly Provider[], query: string): Provider[] {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/u);
	return providers.filter((provider) => {
		const kind = provider.kind === "vercel-ai-gateway" ? "Vercel AI Gateway" : "OpenAI-compatible";
		const text = `${provider.name} ${kind} ${provider.enabled ? "On" : "Off"}`.toLocaleLowerCase();
		return terms.every((term) => text.includes(term));
	});
}
