import { ArrowClockwise, Copy, SignIn, Star, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { IconButton } from "../../primitives/IconButton";
import { Switch } from "../../primitives/Switch";
import { Tooltip } from "../../primitives/Tooltip";
import { QuotaWindows } from "../QuotaWindows";

type Account = {
	id: string;
	name: string;
	harness: string;
	profilePath: string;
	isDefault: boolean;
	enabled: boolean;
	loginCommand: string | null;
};
type Quota = {
	status: string;
	email: string | null;
	plan: string | null;
	detail: string | null;
	fetchedAt: string;
	windows: { id: string; label: string; usedPercent: number; resetsAt: string | null }[];
};
export function HarnessAccountCard({
	account,
	quota,
	busy,
	refreshing,
	error,
	onDefault,
	onEnabled,
	onRemove,
	onRefresh,
	onCopy,
}: {
	account: Account;
	quota?: Quota;
	busy: boolean;
	refreshing: boolean;
	error?: string;
	onDefault: () => void;
	onEnabled: (enabled: boolean) => void;
	onRemove: () => void;
	onRefresh: () => void;
	onCopy: (text: string) => void;
}) {
	const [login, setLogin] = useState(false);
	const label =
		{
			ok: "Quota available",
			unlimited: "Unlimited: the provider reports no quota window",
			signed_out: "Sign in required",
			expired: "Sign-in refresh required",
			unavailable: "Quota unavailable",
		}[quota?.status ?? ""] ?? "Check quota…";
	return (
		<article aria-label={account.name} className="flex min-w-0 flex-col gap-3 py-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-md font-semibold text-fg break-words">{account.name}</h3>
					<p className="text-sm text-fg-muted">
						{account.harness} {account.isDefault ? "· Default" : ""}
					</p>
				</div>
				<div className="flex shrink-0 gap-1">
					<Tooltip content="Make default">
						<IconButton
							label={`Make ${account.name} the default`}
							disabled={busy || account.isDefault || !account.enabled}
							onClick={onDefault}
							icon={<Star weight={account.isDefault ? "fill" : "regular"} />}
						/>
					</Tooltip>
					<Tooltip content="Sign in">
						<IconButton
							label={`Sign in to ${account.name}`}
							onClick={() => setLogin(true)}
							disabled={!account.loginCommand}
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
					<Tooltip content="Remove account">
						<IconButton label={`Remove ${account.name}`} disabled={busy} onClick={onRemove} icon={<Trash />} />
					</Tooltip>
				</div>
			</div>
			{quota?.email && (
				<p className="text-sm text-fg break-all">
					{quota.email}
					{quota.plan ? ` · ${quota.plan}` : ""}
				</p>
			)}
			<p role="status" className="text-sm text-fg-muted">
				{label}
			</p>
			{quota?.detail && <p className="text-sm text-fg-muted text-pretty">{quota.detail}</p>}
			{quota && <QuotaWindows name={account.name} windows={quota.windows} />}
			<p className="break-all font-mono text-xs text-fg-faint">{account.profilePath}</p>
			<Switch
				label={`Allow managers to use ${account.name}`}
				checked={account.enabled}
				disabled={busy}
				onCheckedChange={onEnabled}
			/>
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<Dialog
				open={login}
				onOpenChange={setLogin}
				title={`Sign in to ${account.name}`}
				description="Run this command in a terminal on the Trellis host. Complete the CLI sign-in, then refresh this account."
			>
				<div className="flex min-w-0 items-start gap-2">
					<code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-sm">{account.loginCommand}</code>
					<Tooltip content="Copy command">
						<IconButton label="Copy login command" onClick={() => onCopy(account.loginCommand!)} icon={<Copy />} />
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
