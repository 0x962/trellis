// API list prices in USD per million tokens. A subscription does not bill
// per token, so the report prices every turn at the API rate and labels the
// result as an estimate. The match is the longest prefix of the lowercased
// model id. An unknown model takes the cheapest rate of its harness, and
// the result is marked approximate.

import type { UsageHarness } from "@trellis/api";

export const PRICING_TABLE_UPDATED = "2026-09-23";

export type ModelRate = {
	inputPerM: number;
	outputPerM: number;
	// The cache read price for a model that does not use the usual share of
	// its input rate.
	cacheReadPerM?: number;
	longContext?: ModelRate;
};

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2;

const CLAUDE_RATES: Record<string, ModelRate> = {
	// Fable 5.1 and Mythos 5.1 keep the Fable 5 token price and cut cache
	// reads to $0.25/M, 0.025x input instead of the usual 0.1x.
	"claude-fable-5-1": { inputPerM: 10, outputPerM: 50, cacheReadPerM: 0.25 },
	"claude-mythos-5-1": { inputPerM: 10, outputPerM: 50, cacheReadPerM: 0.25 },
	"claude-fable-5": { inputPerM: 10, outputPerM: 50 },
	"claude-mythos": { inputPerM: 10, outputPerM: 50 },
	// Opus 5.5 cuts cache reads to $0.20/M, 0.05x input instead of the usual 0.1x.
	"claude-opus-5-5": { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2 },
	"claude-opus-5": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-7": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-6": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-5": { inputPerM: 5, outputPerM: 25 },
	// Opus 4.0 and 4.1 came before the price cut.
	"claude-opus-4": { inputPerM: 15, outputPerM: 75 },
	"claude-sonnet-5": { inputPerM: 2, outputPerM: 10 },
	"claude-sonnet-4": { inputPerM: 3, outputPerM: 15 },
	"claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
	"claude-3-5-haiku": { inputPerM: 0.8, outputPerM: 4 },
};

const CODEX_RATES: Record<string, ModelRate> = {
	"gpt-6-astra": { inputPerM: 10, outputPerM: 50 },
	// The Sol price is a promotion that lasts at least through 2026-11-21.
	// The bare `gpt-5.6` id follows Sol.
	"gpt-5.6-sol": { inputPerM: 4, outputPerM: 20 },
	"gpt-5.6-terra": { inputPerM: 2, outputPerM: 12 },
	"gpt-5.6-luna": { inputPerM: 0.2, outputPerM: 1.2 },
	"gpt-5.6": { inputPerM: 4, outputPerM: 20 },
	"gpt-5.3-codex": { inputPerM: 1.75, outputPerM: 14 },
	"gpt-5.3": { inputPerM: 1.75, outputPerM: 14 },
	"gpt-5-codex": { inputPerM: 1.25, outputPerM: 10 },
	"gpt-5": { inputPerM: 1.25, outputPerM: 10 },
	"gpt-4.1": { inputPerM: 2, outputPerM: 8 },
	"gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
};

const GEMINI_RATES: Record<string, ModelRate> = {
	"gemini-3.1-pro": { inputPerM: 2, outputPerM: 12, longContext: { inputPerM: 4, outputPerM: 18 } },
	"gemini-3-flash": { inputPerM: 0.5, outputPerM: 3 },
	"gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10, longContext: { inputPerM: 2.5, outputPerM: 15 } },
	"gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
};

const MUSE_RATES: Record<string, ModelRate> = {
	"muse-spark": { inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 1.25 },
	"muse-glimmer": { inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 1.25 },
};

// Pi and OpenCode route to many providers. They record their own cost, and
// this table is the fallback for a message without one.
const MULTI_PROVIDER_RATES: Record<string, ModelRate> = { ...CLAUDE_RATES, ...CODEX_RATES, ...GEMINI_RATES };

const RATES_BY_HARNESS: Record<UsageHarness, Record<string, ModelRate>> = {
	claude: CLAUDE_RATES,
	codex: CODEX_RATES,
	pi: MULTI_PROVIDER_RATES,
	opencode: MULTI_PROVIDER_RATES,
	muse: MUSE_RATES,
};

const cheapestByHarness = new Map<UsageHarness, ModelRate>();
function cheapestRate(harness: UsageHarness): ModelRate {
	let cheapest = cheapestByHarness.get(harness);
	if (!cheapest) {
		for (const rate of Object.values(RATES_BY_HARNESS[harness])) {
			if (!cheapest || rate.inputPerM + rate.outputPerM < cheapest.inputPerM + cheapest.outputPerM) cheapest = rate;
		}
		cheapestByHarness.set(harness, cheapest as ModelRate);
	}
	return cheapest as ModelRate;
}

export type MatchedRate = ModelRate & {
	// True when the model was not in the table and took the cheapest rate.
	approximate: boolean;
};

export function matchModelRate(harness: UsageHarness, model: string, promptTokens = 0): MatchedRate {
	const rates = RATES_BY_HARNESS[harness];
	const normalized = model.toLowerCase();
	// A multi-provider harness qualifies the id with its vendor, such as
	// "anthropic/claude-sonnet-4". The segment after the last slash matches too.
	const candidates = [normalized];
	const slash = normalized.lastIndexOf("/");
	if (slash >= 0 && slash < normalized.length - 1) candidates.push(normalized.slice(slash + 1));
	let best: { prefix: string; rate: ModelRate } | null = null;
	for (const candidate of candidates) {
		for (const [prefix, rate] of Object.entries(rates)) {
			if (candidate.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) best = { prefix, rate };
		}
	}
	if (best) {
		const rate = promptTokens > 200_000 && best.rate.longContext ? best.rate.longContext : best.rate;
		return { ...rate, approximate: false };
	}
	return { ...cheapestRate(harness), approximate: true };
}

export type TokenCounts = {
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
};

function cacheReadPerM(rate: ModelRate): number {
	return rate.cacheReadPerM ?? rate.inputPerM * CACHE_READ_MULTIPLIER;
}

export function costUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (
		(tokens.uncachedInput / 1e6) * rate.inputPerM +
		(tokens.output / 1e6) * rate.outputPerM +
		(tokens.cachedInput / 1e6) * cacheReadPerM(rate) +
		(tokens.cacheWrite5m / 1e6) * rate.inputPerM * CACHE_WRITE_5M_MULTIPLIER +
		(tokens.cacheWrite1h / 1e6) * rate.inputPerM * CACHE_WRITE_1H_MULTIPLIER
	);
}

// The difference between full-price input tokens and cache read or write tokens.
export function cacheSavingsUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (
		(tokens.cachedInput / 1e6) * (rate.inputPerM - cacheReadPerM(rate)) -
		(tokens.cacheWrite5m / 1e6) * rate.inputPerM * (CACHE_WRITE_5M_MULTIPLIER - 1) -
		(tokens.cacheWrite1h / 1e6) * rate.inputPerM * (CACHE_WRITE_1H_MULTIPLIER - 1)
	);
}
