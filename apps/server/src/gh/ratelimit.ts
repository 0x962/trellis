import type { GhFailure, GhRunner } from "./run.ts";

// `gh api rate_limit` reports one budget per resource. GitHub charges a
// `gh api graphql` call, and so every poller tick, to the graphql resource,
// and a REST call such as a diff fetch to the core resource. The reader
// reports the resource with the lower remaining fraction, so a drained
// graphql budget slows the poller although core is full. The poller reads
// it every 5 minutes and stretches every interval by `multiplier` while the
// fraction is under 20 percent.

export type RateLimitResource = "core" | "graphql";

export type RateLimit = {
	ok: true;
	resource: RateLimitResource;
	limit: number;
	remaining: number;
	resetAt: string;
	fraction: number;
	multiplier: number;
};

export type RateLimitResult = RateLimit | GhFailure;

type ResourceBudget = { limit: number; remaining: number; reset: number };
type RateLimitBody = { resources: Record<RateLimitResource, ResourceBudget> };

export const LOW_BUDGET_FRACTION = 0.2;
export const LOW_BUDGET_MULTIPLIER = 4;

export const intervalMultiplier = (fraction: number): number =>
	fraction < LOW_BUDGET_FRACTION ? LOW_BUDGET_MULTIPLIER : 1;

const fractionOf = (budget: ResourceBudget) => budget.remaining / budget.limit;

export const readRateLimit = async (runGh: GhRunner): Promise<RateLimitResult> => {
	const result = await runGh("poller", ["api", "rate_limit"]);
	if (!result.ok) return result;
	const { core, graphql } = (JSON.parse(result.stdout) as RateLimitBody).resources;
	const resource: RateLimitResource = fractionOf(graphql) < fractionOf(core) ? "graphql" : "core";
	const { limit, remaining, reset } = resource === "graphql" ? graphql : core;
	const fraction = remaining / limit;
	return {
		ok: true,
		resource,
		limit,
		remaining,
		resetAt: new Date(reset * 1000).toISOString(),
		fraction,
		multiplier: intervalMultiplier(fraction),
	};
};
