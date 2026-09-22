import { parseGhJsonResult } from "./json.ts";
import type { GhFailure, GhRunner } from "./run.ts";

// `gh api rate_limit` reports one budget per resource. GitHub charges a
// `gh api graphql` call, and so every poller tick, to the graphql resource.
// A REST call such as a diff fetch goes to the core resource. GitHub.com
// reports both. Another host can report one of them or neither. The reader
// compares the budgets the body carries and reports the one with the lower
// remaining fraction. A drained graphql budget thus slows the poller
// although core is full. The poller reads it every 5 minutes and stretches
// every interval by `multiplier` while the fraction is under 20 percent.

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

// gh answered, but the reply holds no budget the reader can use. `stdout` is
// the raw reply, so the log shows what the host sent.
export type RateLimitShapeFailure = { ok: false; reason: "shape"; stdout: string };

export type RateLimitResult = RateLimit | GhFailure | RateLimitShapeFailure;

type ResourceBudget = { limit: number; remaining: number; reset: number };

export const LOW_BUDGET_FRACTION = 0.2;
export const LOW_BUDGET_MULTIPLIER = 4;

export const intervalMultiplier = (fraction: number): number =>
	fraction < LOW_BUDGET_FRACTION ? LOW_BUDGET_MULTIPLIER : 1;

const fractionOf = (budget: ResourceBudget) => budget.remaining / budget.limit;

// A budget with a limit of 0 gives no fraction, so it counts as no budget.
const budgetOf = (value: unknown): ResourceBudget | null => {
	const budget = value as Partial<ResourceBudget> | null | undefined;
	if (typeof budget?.limit !== "number" || budget.limit <= 0) return null;
	if (typeof budget.remaining !== "number" || typeof budget.reset !== "number") return null;
	return budget as ResourceBudget;
};

// The reply comes from gh, so its text can be anything: an HTML error page
// from a proxy, or JSON without the expected keys.
export const readRateLimit = async (runGh: GhRunner): Promise<RateLimitResult> => {
	const result = await runGh("poller", ["api", "rate_limit"]);
	if (!result.ok) return result;
	const parsed = parseGhJsonResult<{ resources?: unknown } | null>(["api", "rate_limit"], result.stdout, result.code);
	if (!parsed.ok) return parsed.failure;
	const resources =
		typeof parsed.value?.resources === "object" ? (parsed.value.resources as Record<string, unknown> | null) : null;
	const budgets = (["core", "graphql"] as const)
		.map((resource) => ({ resource, budget: budgetOf(resources?.[resource]) }))
		.filter((entry): entry is { resource: RateLimitResource; budget: ResourceBudget } => entry.budget !== null);
	if (budgets.length === 0) return { ok: false, reason: "shape", stdout: result.stdout };
	const lowest = budgets.reduce((low, entry) => (fractionOf(entry.budget) < fractionOf(low.budget) ? entry : low));
	const { limit, remaining, reset } = lowest.budget;
	const fraction = remaining / limit;
	return {
		ok: true,
		resource: lowest.resource,
		limit,
		remaining,
		resetAt: new Date(reset * 1000).toISOString(),
		fraction,
		multiplier: intervalMultiplier(fraction),
	};
};
