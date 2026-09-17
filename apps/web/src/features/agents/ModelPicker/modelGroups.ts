import type { MODEL_CATALOG } from "@trellis/api";

type Model = (typeof MODEL_CATALOG)[number];

const familyMatchers = [
	["Fable", /\bFable\b/i],
	["Opus", /\bOpus\b/i],
	["Sonnet", /\bSonnet\b/i],
	["Haiku", /\bHaiku\b/i],
	["Astra", /\bAstra\b/i],
	["Luna", /\bLuna\b/i],
	["Sol", /\bSol\b/i],
	["Terra", /\bTerra\b/i],
	["Codex", /\bCodex\b/i],
	["Gemini", /\bGemini\b/i],
	["Gemma", /\bGemma\b/i],
	["Llama", /\bLlama\b/i],
	["Glimmer", /\bGlimmer\b/i],
	["Spark", /\bSpark\b/i],
	["GPT", /\bGPT\b/i],
	["o-series", /^o\d/i],
] as const;

export function modelFamily(name: string): string {
	return familyMatchers.find(([, pattern]) => pattern.test(name))?.[0] ?? "Other";
}

export function modelGroups(models: readonly Model[]) {
	const groups = new Map<string, Model[]>();
	for (const model of models) {
		const family = modelFamily(model.name);
		groups.set(family, [...(groups.get(family) ?? []), model]);
	}
	return [...groups].sort(([left], [right]) => left.localeCompare(right));
}
