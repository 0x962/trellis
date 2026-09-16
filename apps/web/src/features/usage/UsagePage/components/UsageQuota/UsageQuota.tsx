import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { QuotaWindows, SectionHeader, Skeleton } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { harnessLabel } from "../../../formatUsage";

const statusLabel: Record<string, string> = {
	ok: "",
	signed_out: "Sign in required",
	expired: "Sign-in refresh required",
	unavailable: "Quota unavailable",
	unsupported: "Quota not supported",
};

// The subscription quota of every enabled account, one card each. The
// server caches a quota for five minutes; Settings holds the refresh and
// the account actions.
export function UsageQuota() {
	const { orpc } = useApp();
	const accounts = useQuery({ ...orpc.harnessAccounts.list.queryOptions({ input: {} }), refetchInterval: 60_000 });
	const values = (accounts.data ?? []).filter((account) => account.enabled && account.capabilities.quota);
	const quotas = useQueries({
		queries: values.map((account) => ({
			...orpc.harnessAccounts.quota.queryOptions({ input: { id: account.id } }),
			refetchInterval: 300_000,
		})),
	});
	if (accounts.isPending) {
		return (
			<div role="status" aria-label="Load accounts">
				<span className="sr-only">Load accounts</span>
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}
	if (values.length === 0) return null;
	return (
		<section aria-label="Subscription quota" className="flex flex-col gap-3">
			<SectionHeader
				title="Subscription quota"
				count={values.length}
				actions={
					<Link to="/settings" hash="agent-accounts" className="hover:text-fg hover:underline">
						Manage accounts
					</Link>
				}
			/>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{values.map((account, index) => {
					const quota = quotas[index]?.data;
					const error = quotas[index]?.error;
					return (
						<article
							key={account.id}
							aria-label={account.name}
							className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-4"
						>
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="truncate text-md font-medium text-fg">{account.name}</h3>
								<span className="shrink-0 text-xs text-fg-faint">
									{harnessLabel[account.harness]}
									{account.isDefault ? " · Default" : ""}
								</span>
							</div>
							{quota?.email && (
								<p className="truncate text-sm text-fg-muted">
									{quota.email}
									{quota.plan ? ` · ${quota.plan}` : ""}
								</p>
							)}
							{error ? (
								<p role="alert" className="text-sm text-danger">
									{error.message}
								</p>
							) : !quota ? (
								<p role="status" className="text-sm text-fg-muted">
									Check quota…
								</p>
							) : quota.status === "ok" ? (
								<QuotaWindows name={account.name} windows={quota.windows} />
							) : (
								<p role="status" className="text-sm text-fg-muted">
									{statusLabel[quota.status]}
									{quota.detail ? ` · ${quota.detail}` : ""}
								</p>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}
