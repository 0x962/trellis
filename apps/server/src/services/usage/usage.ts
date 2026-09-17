import type { UsageHarness, UsageReport, UsageReportInput } from "@trellis/api";
import { executionEnvironment } from "../../executionEnvironment";
import { resolveHostDefault } from "../harnessAccounts/hostDefault.ts";
import type { IoCtx } from "../support.ts";
import { computeUsageReport, rangeStart } from "./aggregate.ts";
import { collectUsageEntries } from "./entries.ts";
import { claudeSessionOwners } from "./owners.ts";
import { listUsageAccounts, listUsageProjects, listUsageRuns } from "./queries.ts";
import { usageRoots } from "./roots.ts";

const CACHE_MS = 5 * 60 * 1000;
const REFRESH_FLOOR_MS = 10 * 1000;

const cache = new Map<string, { at: number; result: Promise<UsageReport> }>();

export const invalidateUsageReports = (home: string) => {
	for (const key of cache.keys()) if (key.startsWith(`${home}:`)) cache.delete(key);
};

// Builds the report outside every database transaction: the transcript
// scan reads gigabytes on a heavy machine, and the database lock must stay
// free while it runs. The three short reads of accounts, runs, and projects
// open their own transactions. A report is cached for five minutes per
// range, and a refresh is served from the cache for ten seconds.
export const prepareReport = async (
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
		const defaultAccounts: Partial<Record<UsageHarness, string>> = {};
		for (const harness of ["claude", "codex", "pi", "opencode", "muse"] as const) {
			const resolved = await resolveHostDefault(harness, accounts, env);
			if (resolved.account) defaultAccounts[harness] = resolved.account.name;
		}
		const collected = await collectUsageEntries(roots, days, cutoffMs);
		return computeUsageReport({
			...collected,
			runs,
			projects,
			sessionAccounts,
			defaultAccounts,
			days,
			cutoffMs,
			now: new Date(deps.now()),
		});
	})();
	cache.set(key, { at: now, result });
	result.catch(() => {
		if (cache.get(key)?.result === result) cache.delete(key);
	});
	return result;
};
