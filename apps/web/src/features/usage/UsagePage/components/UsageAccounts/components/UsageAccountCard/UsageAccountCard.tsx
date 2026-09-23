import { ArrowClockwise, Copy, PencilSimple, SignIn, Star, Trash } from "@phosphor-icons/react";
import type { HarnessAccount, UsageAccount, UsageGroupRow, UsageMetric } from "@trellis/api";
import {
	Button,
	CodeText,
	Dialog,
	IconButton,
	ProviderIcon,
	QuotaWindows,
	Skeleton,
	Tooltip,
	toast,
	writeClipboard,
} from "@trellis/ui";
import { useState } from "react";
import { formatMetric, formatShare, formatUsd, harnessLabel, harnessProvider } from "../../../../../formatUsage";

const statusLabel: Record<UsageAccount["quota"]["status"], string> = {
	ok: "Quota available",
	unlimited: "Unlimited",
	metered: "Metered billing",
	signed_out: "Sign in required",
	stale: "Quota refresh pending",
	expired: "Sign-in expired",
	unavailable: "Quota unavailable",
};

const needsLogin = new Set<UsageAccount["quota"]["status"]>(["signed_out", "expired"]);

const formatObservedAt = (iso: string) =>
	new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const copy = async (text: string) => {
	try {
		await writeClipboard(text);
		toast("Login command copied");
	} catch (error) {
		toast(error instanceof Error ? error.message : "Could not copy the command.");
	}
};

export function UsageAccountCard({
	account,
	managed,
	row,
	shared,
	metric,
	total,
	pending,
	busy,
	refreshing,
	onDefault,
	onRename,
	onRemove,
	onRefresh,
}: {
	account: UsageAccount;
	managed?: HarnessAccount;
	row?: UsageGroupRow;
	shared?: UsageGroupRow;
	metric: UsageMetric;
	total: number;
	pending: boolean;
	busy: boolean;
	refreshing: boolean;
	onDefault: () => void;
	onRename: () => void;
	onRemove: () => void;
	onRefresh: () => void;
}) {
	const [login, setLogin] = useState(false);
	const value = row?.[metric] ?? 0;
	const sharedValue = shared?.[metric] ?? 0;
	const quotaDetail =
		account.quota.creditsBalance !== null
			? `${formatUsd(account.quota.creditsBalance)} credits`
			: account.quota.extraUsage
				? `${formatUsd(account.quota.extraUsage.usedCents / 100)} of ${formatUsd(account.quota.extraUsage.limitCents / 100)} extra usage`
				: null;
	return (
		<article aria-label={account.name} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<h3 className="flex min-w-0 items-center gap-2 text-md font-medium text-fg">
						{harnessProvider[account.harness] && (
							<ProviderIcon provider={harnessProvider[account.harness]!} className="text-fg-muted" />
						)}
						<span className="break-words">{account.name}</span>
					</h3>
					<p className="mt-1 text-xs text-fg-faint">
						{harnessLabel[account.harness]}
						{account.isDefault ? ` · Default${account.defaultSource === "superset" ? " via SuperSet" : ""}` : ""}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-1">
					{managed && (
						<>
							<Tooltip content="Make default">
								<IconButton
									label={`Make ${account.name} the default`}
									disabled={busy || managed.isDefault}
									onClick={onDefault}
									icon={<Star weight={managed.isDefault ? "fill" : "regular"} />}
								/>
							</Tooltip>
							<Tooltip content="Rename account">
								<IconButton
									label={`Rename ${account.name}`}
									disabled={busy}
									onClick={onRename}
									icon={<PencilSimple />}
								/>
							</Tooltip>
						</>
					)}
					<Tooltip content="Sign in">
						<IconButton
							label={`Sign in to ${account.name}`}
							disabled={!account.loginCommand}
							onClick={() => setLogin(true)}
							icon={<SignIn />}
						/>
					</Tooltip>
					<Tooltip content="Refresh quota">
						<IconButton
							label={`Refresh quota for ${account.name}`}
							disabled={refreshing}
							onClick={onRefresh}
							icon={<ArrowClockwise />}
						/>
					</Tooltip>
					{managed && (
						<Tooltip content="Remove account">
							<IconButton label={`Remove ${account.name}`} disabled={busy} onClick={onRemove} icon={<Trash />} />
						</Tooltip>
					)}
				</div>
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
			{shared && sharedValue > 0 && (
				<p className="text-xs text-fg-faint text-pretty">
					{formatMetric(metric, sharedValue)} more is in a transcript directory this login shares with{" "}
					{account.sharedWith.join(", ")}, so Trellis cannot split it between them.
				</p>
			)}
			{account.quota.status === "ok" ? (
				<>
					<QuotaWindows name={account.name} windows={account.quota.windows} />
					{quotaDetail && <p className="text-xs text-fg-muted tabular">{quotaDetail}</p>}
					{account.harness === "muse" && (
						<p className="text-xs text-fg-faint tabular">Observed {formatObservedAt(account.quota.fetchedAt)}</p>
					)}
				</>
			) : account.quota.status === "unlimited" || account.quota.status === "metered" ? (
				<p role="status" className="text-sm text-success">
					{statusLabel[account.quota.status]}
					{account.quota.detail ? ` · ${account.quota.detail}` : ""}
					{quotaDetail ? ` · ${quotaDetail}` : ""}
				</p>
			) : needsLogin.has(account.quota.status) && account.loginCommand ? (
				<div className="flex flex-col gap-2">
					<p role="status" className="text-sm text-warning">
						{statusLabel[account.quota.status]}. Run this command on this machine, then refresh.
					</p>
					<div className="flex min-w-0 items-start gap-2">
						<CodeText className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-sm bg-elevated px-2 py-1 text-xs text-fg">
							{account.loginCommand}
						</CodeText>
						<Tooltip content="Copy login command">
							<IconButton
								label={`Copy the login command of ${account.name}`}
								icon={<Copy />}
								onClick={() => void copy(account.loginCommand!)}
							/>
						</Tooltip>
					</div>
				</div>
			) : (
				<p role="status" className="text-sm text-fg-muted">
					{statusLabel[account.quota.status]}
					{account.quota.detail ? ` · ${account.quota.detail}` : ""}
				</p>
			)}
			<CodeText className="break-all text-xs text-fg-faint">{account.profilePath}</CodeText>
			<Dialog
				open={login}
				onOpenChange={setLogin}
				title={`Sign in to ${account.name}`}
				description="Run this command on the Trellis host. Complete the CLI sign-in, then refresh this account."
			>
				<div className="flex min-w-0 items-start gap-2">
					<code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-sm">{account.loginCommand}</code>
					<Tooltip content="Copy command">
						<IconButton label="Copy login command" onClick={() => void copy(account.loginCommand!)} icon={<Copy />} />
					</Tooltip>
				</div>
				<div className="flex justify-end">
					<Button
						onClick={() => {
							setLogin(false);
							onRefresh();
						}}
					>
						Done
					</Button>
				</div>
			</Dialog>
		</article>
	);
}
