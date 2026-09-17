import type { UsageHarness, UsageReport, UsageReportInput } from "@trellis/api";
import { executionEnvironment } from "../../executionEnvironment";
import { resolveHostDefault } from "../harnessAccounts/hostDefault.ts";
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
		return computeUsageReportInWorker({
			roots,
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
