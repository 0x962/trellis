import type { UsageRankingInput, UsageReport, UsageReportInput } from "@trellis/api";
import { invalidInput } from "../../errors.ts";
import { executionEnvironment } from "../../executionEnvironment";
import type { IoCtx } from "../support.ts";
import { rangeStart } from "./aggregate.ts";
import { claudeSessionOwners } from "./owners.ts";
import { listUsageAccounts, listUsageProjects, listUsageRuns } from "./queries.ts";
import { computeUsageReportInWorker } from "./reportWorker";
import { usageRoots } from "./roots.ts";

const CACHE_MS = 5 * 60 * 1000;
const REFRESH_FLOOR_MS = 10 * 1000;

const cache = new Map<string, { at: number; result: Promise<UsageReport> }>();

export const invalidateUsageReports = (home: string) => {
	for (const key of cache.keys()) if (key.startsWith(`${home}:`)) cache.delete(key);
};

// Builds the report outside every database transaction. The account, run,
// and project reads use one short transaction. The transcript scan runs on
// a separate worker. A report stays in the cache for five minutes per range.
// A refresh uses a result from the last ten seconds.
const fullReport = async (
	ctx: IoCtx,
	input: UsageReportInput,
	deps = { env: () => executionEnvironment(), now: Date.now },
): Promise<UsageReport> => {
	const days = input.days ?? 30;
	const key = `${ctx.home}:${days}`;
	const saved = cache.get(key);
	const now = deps.now();
	if (saved && now - saved.at < (input.refresh ? REFRESH_FLOOR_MS : CACHE_MS)) return saved.result;
	const result = (async () => {
		const cutoffMs = rangeStart(days, new Date(now));
		const { accounts, runs, projects } = await ctx.newTx(async (tx) => ({
			accounts: await listUsageAccounts(tx),
			runs: await listUsageRuns(tx, ctx.home, new Date(cutoffMs)),
			projects: await listUsageProjects(tx),
		}));
		const env = await deps.env();
		const roots = await usageRoots(accounts, env);
		const sessionAccounts = await claudeSessionOwners(accounts, env);
		return computeUsageReportInWorker({
			roots,
			runs,
			projects,
			sessionAccounts,
			days,
			cutoffMs,
			now: new Date(deps.now()),
		});
	})();
	cache.set(key, { at: now, result });
	void result.then(
		() => {
			if (cache.get(key)?.result === result) cache.set(key, { at: deps.now(), result });
		},
		() => {
			if (cache.get(key)?.result === result) cache.delete(key);
		},
	);
	return result;
};

export const prepareReport = async (ctx: IoCtx, input: UsageReportInput): Promise<UsageReport> => {
	const report = await fullReport(ctx, input);
	const preview = (metric: "usd" | "tokens") => ({
		groups: Object.fromEntries(
			Object.entries(report.rankings[metric].groups).map(([key, rows]) => [
				key,
				key === "account" ? rows : rows.slice(0, 8),
			]),
		) as UsageReport["rankings"]["usd"]["groups"],
		sessions: report.rankings[metric].sessions.slice(0, 10),
	});
	return { ...report, rankings: { usd: preview("usd"), tokens: preview("tokens") } };
};

export const readRankingReport = async (
	ctx: IoCtx,
	input: UsageRankingInput,
	reports = cache,
): Promise<UsageReport> => {
	const saved = reports.get(`${ctx.home}:${input.days}`);
	if (!saved) throw invalidInput("computedAt", "The Usage report expired. Refresh usage to read its pages.");
	const report = await saved.result;
	if (report.computedAt !== input.computedAt)
		throw invalidInput("computedAt", "The Usage report changed. Refresh usage to read its pages.");
	return report;
};
