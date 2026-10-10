import { useQueries, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Button, Command, ConfirmDialog, Dialog, FailureState } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AccountCreateForm } from "../../agents/AccountCreateForm";
import { createNameItem } from "../../pickers/utils/createNameItem";
import { useSessionRestart } from "../useSessionRestart";

export function SwitchAccountDialog({ run, onClose }: { run: AgentRun; onClose: () => void }) {
	const { client, orpc } = useApp();
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const choices = (accounts.data ?? []).filter((account) => account.harness === run.harness?.preset);
	const quotas = useQueries({
		queries: choices.map(({ id }) => ({ ...orpc.harnessAccounts.quota.queryOptions({ input: { id } }), staleTime: 0 })),
	});
	const [selected, setSelected] = useState<{ id: string; label: string; terminalId: string; requestId: string } | null>(
		null,
	);
	const [activeAccount, setActiveAccount] = useState(run.accountId ?? "");
	const [search, setSearch] = useState("");
	const [createName, setCreateName] = useState<string | null>(null);
	const harness = run.harness?.preset;
	const createItem =
		accounts.isSuccess && harness && harness !== "custom"
			? createNameItem(
					"account",
					search,
					choices.map((account) => account.name),
				)
			: null;
	const [launchError, setLaunchError] = useState<string | null>(null);
	const change = useSessionRestart(run, {
		mutationFn: () =>
			client.agentRuns.switchAccount({
				id: run.id,
				accountId: selected!.id,
				expectedTerminalId: selected!.terminalId,
				requestId: selected!.requestId,
				confirmInterrupt: true,
			}),
		onSuccess: (result) => {
			if (result.error) setLaunchError(result.error);
			else if (result.state !== "running")
				setLaunchError(`The session is ${result.state}. Inspect it before another switch.`);
			else if (result.accountId !== selected!.id) setLaunchError("The session did not switch accounts.");
			else onClose();
		},
	});
	const failure = change.error?.message ?? launchError;
	const items = choices.map((account, index) => {
		const quota = quotas[index]!;
		const quotaLabel = quota.data?.windows.length
			? quota.data.windows
					.filter(
						(window) =>
							!["claude", "codex"].includes(account.harness) ||
							["five_hour", "seven_day", "primary", "secondary"].includes(window.id),
					)
					.map((window) => `${window.label}: ${window.usedPercent}% used`)
					.join(" · ")
			: quota.isPending
				? "Load quota…"
				: (quota.data?.detail ?? quota.data?.status ?? "Quota unavailable");
		return {
			id: account.id,
			label: account.name,
			email: quota.data?.email,
			quotaLabel,
			keywords: [account.name, quota.data?.email ?? ""],
			checked: account.id === run.accountId,
			sub: [quota.data?.email, quotaLabel].filter(Boolean).join(" · "),
		};
	});
	const query = search.trim().toLowerCase();
	const visibleItems = items.filter((item) =>
		[item.label, ...item.keywords].some((value) => value.toLowerCase().includes(query)),
	);
	const activeItem = items.find((item) => item.id === activeAccount);
	return (
		<>
			<Dialog
				open={selected === null && createName === null}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				title="Switch account"
				size="lg"
			>
				{accounts.error && (
					<FailureState
						title="Accounts did not load"
						detail={accounts.error.message}
						action={
							<Button size="md" processing={accounts.isFetching} onClick={() => void accounts.refetch()}>
								Retry
							</Button>
						}
					/>
				)}
				{(!accounts.error || accounts.data) && (
					<Command.Root
						label="Search accounts"
						value={activeAccount}
						onValueChange={setActiveAccount}
						shouldFilter={false}
					>
						<Command.Field
							autoFocus
							label="Search accounts"
							placeholder="Search accounts"
							value={search}
							onValueChange={setSearch}
						/>
						<Command.List>
							{visibleItems.length === 0 && !createItem && (
								<Command.Empty>
									{accounts.isPending
										? "Load accounts…"
										: query
											? "No matching accounts."
											: "No accounts for this harness."}
								</Command.Empty>
							)}
							{visibleItems.map((item) => (
								<Command.Row
									key={item.id}
									value={item.id}
									label={item.label}
									leading={<span className="sr-only">{item.sub}</span>}
									keywords={item.keywords}
									checked={item.checked}
									onSelect={() => {
										if (item.id === run.accountId) return;
										setSelected({
											id: item.id,
											label: item.label,
											terminalId: run.terminalId!,
											requestId: crypto.randomUUID(),
										});
									}}
								/>
							))}
							{createItem && (
								<Command.Row
									value={createItem.id}
									label={createItem.label}
									onSelect={() => setCreateName(search.trim())}
								/>
							)}
						</Command.List>
						{activeItem && (
							<Command.Footer>
								<span>{activeItem.email}</span>
								<span>{activeItem.quotaLabel}</span>
							</Command.Footer>
						)}
					</Command.Root>
				)}
			</Dialog>
			{createName !== null && harness && harness !== "custom" && (
				<AccountCreateForm
					scope={JSON.stringify([run.id, run.terminalId])}
					name={createName}
					harness={harness}
					onClose={() => setCreateName(null)}
					onCreated={(account) => {
						setCreateName(null);
						setSelected({
							id: account.id,
							label: account.name,
							terminalId: run.terminalId!,
							requestId: crypto.randomUUID(),
						});
					}}
				/>
			)}
			<ConfirmDialog
				open={selected !== null}
				title={`Switch to ${selected?.label ?? "account"}?`}
				description={
					run.processStatus === "running"
						? "This stops the current process and interrupts any running turn. The session resumes with the same conversation and workspace."
						: "The session resumes with the same conversation and workspace."
				}
				confirmLabel={failure ? "Retry switch" : "Switch account"}
				processing={change.isPending}
				onConfirm={() => {
					setLaunchError(null);
					change.mutate();
				}}
				onCancel={() => {
					if (!change.isPending) {
						change.reset();
						setLaunchError(null);
						setSelected(null);
					}
				}}
			>
				{failure && <FailureState title="The account did not switch" detail={failure} />}
			</ConfirmDialog>
		</>
	);
}
