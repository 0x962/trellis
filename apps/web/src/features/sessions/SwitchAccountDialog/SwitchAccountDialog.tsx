import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Command, ConfirmDialog, Dialog } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

export function SwitchAccountDialog({ run, onClose }: { run: AgentRun; onClose: () => void }) {
	const { client, orpc, queryClient } = useApp();
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const choices = (accounts.data ?? []).filter((account) => account.harness === run.harness?.preset);
	const quotas = useQueries({
		queries: choices.map(({ id }) => ({ ...orpc.harnessAccounts.quota.queryOptions({ input: { id } }), staleTime: 0 })),
	});
	const [selected, setSelected] = useState<{ id: string; label: string; terminalId: string; requestId: string } | null>(
		null,
	);
	const change = useMutation({
		mutationFn: async () => {
			const result = await client.agentRuns.switchAccount({
				id: run.id,
				accountId: selected!.id,
				expectedTerminalId: selected!.terminalId,
				requestId: selected!.requestId,
				confirmInterrupt: true,
			});
			if (result.error) throw new Error(result.error);
			if (result.state !== "running")
				throw new Error(`The session is ${result.state}. Inspect it before another switch.`);
			if (result.accountId !== selected!.id) throw new Error("The session did not switch accounts.");
		},
		onSuccess: onClose,
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
			]),
	});
	const items = choices.map((account, index) => {
		const quota = quotas[index]!;
		return {
			id: account.id,
			label: quota.data?.email ?? account.name,
			keywords: [account.name],
			current: account.id === run.accountId,
			checked: account.id === run.accountId,
			hint: quota.data?.windows.length
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
					: (quota.data?.detail ?? quota.data?.status ?? "Quota unavailable"),
		};
	});
	return (
		<>
			<Dialog
				open={selected === null}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				title="Switch account"
				size="lg"
			>
				<Command
					autoFocus
					label="Search accounts"
					placeholder="Search accounts"
					items={items}
					empty={accounts.isPending ? "Load accounts…" : "No accounts for this harness."}
					onSelect={(id) => {
						if (id === run.accountId) return;
						setSelected({
							id,
							label: items.find((item) => item.id === id)!.label,
							terminalId: run.terminalId!,
							requestId: crypto.randomUUID(),
						});
					}}
				/>
				{accounts.error && (
					<p role="alert" className="text-sm text-danger">
						{accounts.error.message}
					</p>
				)}
			</Dialog>
			<ConfirmDialog
				open={selected !== null}
				title={`Switch to ${selected?.label ?? "account"}?`}
				description={
					run.processStatus === "running"
						? "This stops the current process and interrupts any running turn. The session resumes with the same conversation and workspace."
						: "The session resumes with the same conversation and workspace."
				}
				confirmLabel="Switch account"
				processing={change.isPending}
				onConfirm={() => change.mutate()}
				onCancel={() => {
					if (!change.isPending) {
						change.reset();
						setSelected(null);
					}
				}}
			>
				{change.error && (
					<p role="alert" className="mb-2 text-sm text-danger">
						{change.error.message}
					</p>
				)}
			</ConfirmDialog>
		</>
	);
}
