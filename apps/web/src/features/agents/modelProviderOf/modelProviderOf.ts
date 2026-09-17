import type { ModelProvider } from "@trellis/ui";

export function modelProviderOf(model: string): ModelProvider | null {
	const provider = model.split("/", 1)[0];
	return provider === "anthropic" || provider === "openai" || provider === "google" || provider === "meta"
		? provider
		: null;
}
