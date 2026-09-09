import type { GhFailure, GhRunner } from "./run.ts";

// `gh api rate_limit` reports the core REST budget, which GraphQL calls
// share. The poller reads it every 5 minutes and stretches every interval
// by `multiplier` while the remaining fraction is under 20 percent.

export type RateLimit = {
	ok: true;
	limit: number;
	remaining: number;
	resetAt: string;
	fraction: number;
	multiplier: number;
};

export type RateLimitResult = RateLimit | GhFailure;

type RateLimitBody = { resources: { core: { limit: number; remaining: number; reset: number } } };

export const LOW_BUDGET_FRACTION = 0.2;
export const LOW_BUDGET_MULTIPLIER = 4;

export const intervalMultiplier = (fraction: number): number =>
	fraction < LOW_BUDGET_FRACTION ? LOW_BUDGET_MULTIPLIER : 1;

export const readRateLimit = async (runGh: GhRunner): Promise<RateLimitResult> => {
	const result = await runGh("poller", ["api", "rate_limit"]);
	if (!result.ok) return result;
	const { limit, remaining, reset } = (JSON.parse(result.stdout) as RateLimitBody).resources.core;
	const fraction = remaining / limit;
	return {
		ok: true,
		limit,
		remaining,
		resetAt: new Date(reset * 1000).toISOString(),
		fraction,
		multiplier: intervalMultiplier(fraction),
	};
};
