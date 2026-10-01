import type { UsageRankingInput, UsageReport, UsageReportInput } from "@trellis/api";
import { invalidInput } from "../../errors.ts";
import { executionEnvironment } from "../../executionEnvironment";
import type { IoCtx } from "../support.ts";
import { rangeStart } from "./aggregate.ts";
import { claudeSessionOwners } from "./owners.ts";
import { listUsageAccounts, listUsageProjects, listUsageRuns } from "./queries.ts";
import { createReportCache } from "./reportCache";
import { computeUsageReportInWorker } from "./reportWorker";
import { usageRoots } from "./roots.ts";

const cache = createReportCache();

export const invalidateUsageReports = (home: string) => cache.invalidate(home);

// Builds the report outside every database transaction. The account, run,
// and project reads share one transaction. The transcript scan runs on
// a separate worker. Each range retains its completed report across restarts.
// An explicit refresh replaces that report after the scan and save complete.
const fullReport = async (
	ctx: IoCtx,
	input: UsageReportInput,
	deps = { env: () => executionEnvironment(), now: Date.now },
): Promise<UsageReport> => {
	const days = input.days ?? 30;
	return cache.report(ctx.home, days, input.refresh === true, async () => {
		const now = deps.now();
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
	});
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
	reports: Pick<typeof cache, "ranking"> = cache,
): Promise<UsageReport> => {
	const report = await reports.ranking(ctx.home, input.days, input.computedAt);
	if (!report) throw invalidInput("computedAt", "The Usage report changed. Refresh usage to read its pages.");
	return report;
};
