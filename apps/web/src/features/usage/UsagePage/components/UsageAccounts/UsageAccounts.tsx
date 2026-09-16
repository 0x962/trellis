import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { UsageGroupRow, UsageMetric } from "@trellis/api";
import { QuotaWindows, SectionHeader, Skeleton } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { formatMetric, formatShare, harnessLabel } from "../../../formatUsage";

export type UsageAccountsProps = {
	// The account rows of the report, which give each login its cost.
	rows: readonly UsageGroupRow[];
	metric: UsageMetric;
	total: number;
	// True while the report loads, so the cost of a card waits with it.
	pending: boolean;
};

const statusLabel: Record<string, string> = {
	signed_out: "Sign in required",
	expired: "Sign-in refresh required",
	unavailable: "Quota unavailable",
	unsupported: "Quota not supported",
};

// One card per login on this machine: its subscription quota windows from
// the provider, and its cost in the range from the report. Settings holds
// the account actions.
export function UsageAccounts({ rows, metric, total, pending }: UsageAccountsProps) {
	const { orpc } = useApp();
	const accounts = useQuery({ ...orpc.usage.accounts.queryOptions({ input: {} }), refetchInterval: 300_000 });
	if (accounts.isPending) {
		return (
			<div role="status" aria-label="Load accounts">
				<span className="sr-only">Load accounts</span>
				<Skeleton height="h-32" />
			</div>
		);
	}
	if (accounts.isError) {
		return (
			<p role="alert" className="text-sm text-danger">
				Could not read the accounts. {accounts.error.message}
			</p>
		);
	}
	if (accounts.data.length === 0) return null;
	return (
		<section aria-label="Accounts" className="flex flex-col gap-3">
			<SectionHeader
				title="Accounts"
				count={accounts.data.length}
				actions={
					<Link to="/settings" hash="agent-accounts" className="hover:text-fg hover:underline">
						Manage accounts
					</Link>
				}
			/>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{accounts.data.map((account) => {
					const row = rows.find((candidate) => candidate.key === account.key);
					const value = row?.[metric] ?? 0;
					return (
						<article
							key={account.key}
							aria-label={account.name}
							className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
						>
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="truncate text-md font-medium text-fg">{account.name}</h3>
								<span className="shrink-0 text-xs text-fg-faint">
									{harnessLabel[account.harness]}
									{account.isDefault ? " · Default" : ""}
								</span>
							</div>
							{account.quota.email && (
								<p className="truncate text-sm text-fg-muted">
									{account.quota.email}
									{account.quota.plan ? ` · ${account.quota.plan}` : ""}
								</p>
							)}
							<div className="flex items-baseline justify-between gap-2">
								<span className="text-xs text-fg-faint">{metric === "usd" ? "Cost in range" : "Tokens in range"}</span>
								{pending ? (
									<Skeleton width="w-16" height="h-4" />
								) : (
									<span className="text-md font-medium text-fg tabular">
										{formatMetric(metric, value)}
										<span className="ml-1 text-xs font-normal text-fg-faint">{formatShare(value, total)}</span>
									</span>
								)}
							</div>
							{account.quota.status === "ok" ? (
								<QuotaWindows name={account.name} windows={account.quota.windows} />
							) : (
								<p role="status" className="text-sm text-fg-muted">
									{statusLabel[account.quota.status]}
									{account.quota.detail ? ` · ${account.quota.detail}` : ""}
								</p>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}
