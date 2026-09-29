import {
	ArrowClockwise,
	Copy,
	DotsThree,
	Info,
	PencilSimple,
	SignIn,
	Star,
	TerminalWindow,
	Trash,
} from "@phosphor-icons/react";
import type { HarnessAccount, UsageAccount, UsageGroupRow, UsageMetric } from "@trellis/api";
import {
	Button,
	CodeText,
	Dialog,
	IconButton,
	Menu,
	PropertyRow,
	ProviderIcon,
	QuotaWindows,
	SettingsListRow,
	Skeleton,
	Tooltip,
} from "@trellis/ui";
import { useState } from "react";
import { copyText } from "../../../../../../../lib/clipboard";
import { formatMetric, formatShare, formatUsd, harnessLabel, harnessProvider } from "../../../../../formatUsage";

type QuotaStatus = UsageAccount["quota"]["status"];

const quotaStatusLabel: Record<QuotaStatus, string> = {
	ok: "Quota available",
	unlimited: "Unlimited",
	metered: "Metered billing",
	signed_out: "Sign in required",
	stale: "Quota refresh pending",
	expired: "Sign-in expired",
	unavailable: "Quota unavailable",
};

export const accountQuotaSummary = (account: UsageAccount) => {
	if (account.quota.status !== "ok") return quotaStatusLabel[account.quota.status];
	if (account.quota.windows.length === 0) return quotaStatusLabel.ok;
	const mostUsed = Math.max(...account.quota.windows.map((window) => window.usedPercent));
	return `${Math.round(mostUsed)}% used`;
};

export function UsageAccountRow({
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
	onActiveChange,
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
	onActiveChange?: (active: boolean) => void;
}) {
	const [login, setLogin] = useState(false);
	const [details, setDetails] = useState(false);
	const value = row?.[metric] ?? 0;
	const sharedValue = shared?.[metric] ?? 0;
	const provider = harnessProvider[account.harness];
	const quotaDetail =
		account.quota.creditsBalance !== null
			? `${formatUsd(account.quota.creditsBalance)} credits`
			: account.quota.extraUsage
				? `${formatUsd(account.quota.extraUsage.usedCents / 100)} of ${formatUsd(account.quota.extraUsage.limitCents / 100)} extra usage`
				: null;
	const description = `${harnessLabel[account.harness]} · ${accountQuotaSummary(account)}`;
	return (
		<>
			<SettingsListRow
				label={`${account.name}${account.isDefault ? " · Default" : ""}`}
				description={description}
				icon={
					provider ? (
						<ProviderIcon provider={provider} decorative className="text-fg-muted" />
					) : (
						<TerminalWindow className="text-fg-muted" />
					)
				}
				disabled={busy}
				onEdit={() => {
					setDetails(true);
					onActiveChange?.(true);
				}}
				actions={
					<div className="grid shrink-0 grid-cols-2 items-center gap-1 sm:flex">
						{pending ? (
							<Skeleton width="w-14" height="h-4" className="col-span-2 justify-self-end sm:mr-1" />
						) : (
							<span className="col-span-2 justify-self-end text-sm font-medium text-fg tabular sm:mr-1">
								{formatMetric(metric, value)}
								<span className="ml-1 hidden text-xs font-normal text-fg-faint sm:inline">
									{formatShare(value, total)}
								</span>
							</span>
						)}
						<Tooltip content="Refresh">
							<IconButton
								label={`Refresh quota for ${account.name}`}
								processing={refreshing}
								onClick={onRefresh}
								icon={<ArrowClockwise />}
							/>
						</Tooltip>
						<Menu
							label={`Actions for ${account.name}`}
							triggerTooltip={`Actions for ${account.name}`}
							trigger={<IconButton label={`Actions for ${account.name}`} icon={<DotsThree />} disabled={busy} />}
							onOpenChange={onActiveChange}
							items={[
								...(managed
									? [
											{
												label: "Make default",
												icon: <Star />,
												disabled: managed.isDefault,
												onSelect: onDefault,
											},
											{ label: "Rename", icon: <PencilSimple />, onSelect: onRename },
										]
									: []),
								{
									label: "Sign in",
									icon: <SignIn />,
									disabled: !account.loginCommand,
									onSelect: () => {
										setLogin(true);
										onActiveChange?.(true);
									},
								},
								{
									label: "Edit details",
									icon: <Info />,
									onSelect: () => {
										setDetails(true);
										onActiveChange?.(true);
									},
								},
								...(managed ? [{ label: "Remove", icon: <Trash />, danger: true, onSelect: onRemove }] : []),
							]}
						/>
					</div>
				}
			/>
			<Dialog
				open={details}
				onOpenChange={(open) => {
					setDetails(open);
					onActiveChange?.(open);
				}}
				title={`Edit details for ${account.name}`}
				description="Review the account profile. Rename the account to change its display name."
			>
				<dl className="flex flex-col">
					<PropertyRow label="Harness">{harnessLabel[account.harness]}</PropertyRow>
					<PropertyRow label="Default">{account.isDefault ? "Yes" : "No"}</PropertyRow>
					{account.quota.email && <PropertyRow label="Identity">{account.quota.email}</PropertyRow>}
					{account.quota.plan && <PropertyRow label="Plan">{account.quota.plan}</PropertyRow>}
					<PropertyRow label="Quota" align="start">
						<span className="flex min-w-0 flex-1 flex-col gap-2">
							<span>{accountQuotaSummary(account)}</span>
							{account.quota.status === "ok" && <QuotaWindows name={account.name} windows={account.quota.windows} />}
							{quotaDetail && <span className="text-sm text-fg-muted tabular">{quotaDetail}</span>}
						</span>
					</PropertyRow>
					{shared && sharedValue > 0 && (
						<PropertyRow label="Shared usage" align="start">
							<span className="text-sm text-fg-muted text-pretty">
								{formatMetric(metric, sharedValue)} belongs to a transcript directory shared with{" "}
								{account.sharedWith.join(", ")}.
							</span>
						</PropertyRow>
					)}
					<PropertyRow label="Profile" align="start">
						<CodeText className="break-all text-sm text-fg-muted">{account.profilePath}</CodeText>
					</PropertyRow>
				</dl>
				<div className="flex justify-end gap-2">
					{managed && (
						<Button
							onClick={() => {
								setDetails(false);
								onRename();
							}}
						>
							Rename account
						</Button>
					)}
					<Button variant="primary" onClick={() => setDetails(false)}>
						Done
					</Button>
				</div>
			</Dialog>
			<Dialog
				open={login}
				onOpenChange={(open) => {
					setLogin(open);
					onActiveChange?.(open);
				}}
				title={`Sign in to ${account.name}`}
				description="Run this command on the Trellis host. Complete the CLI sign-in, then refresh this account."
			>
				<div className="flex min-w-0 items-start gap-2">
					<code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-sm">{account.loginCommand}</code>
					<Tooltip content="Copy command">
						<IconButton
							label="Copy login command"
							onClick={() => void copyText(account.loginCommand!, "Login command copied")}
							icon={<Copy />}
						/>
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
		</>
	);
}
