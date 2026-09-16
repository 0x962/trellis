import { Plus } from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { HarnessAccount, HarnessAccountCreate, HarnessAccountUpdate } from "@trellis/api";
import { ConfirmDialog, HarnessAccountCard, HarnessAccountForm, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { accountError } from "./accountError";

export function HarnessAccounts() {
	const { orpc, client } = useApp();
	const active = useLocation({ select: (location) => location.hash === "agent-accounts" });
	const accounts = useQuery({
		...orpc.harnessAccounts.list.queryOptions({ input: {} }),
		enabled: active,
		refetchInterval: active ? 30000 : false,
	});
	const values = accounts.data ?? [];
	const quotas = useQueries({
		queries: values.map((account) => ({
			...orpc.harnessAccounts.quota.queryOptions({ input: { id: account.id } }),
			enabled: active,
			refetchInterval: active ? 300000 : false,
		})),
	});
	const [open, setOpen] = useState(false);
	const [remove, setRemove] = useState<HarnessAccount | null>(null);
	const [error, setError] = useState<string>();
	const create = useMutation({
		mutationFn: (input: HarnessAccountCreate) => client.harnessAccounts.create(input),
		onSuccess: () => {
			setOpen(false);
			void accounts.refetch();
		},
	});
	const update = useMutation({
		mutationFn: (input: HarnessAccountUpdate) => client.harnessAccounts.update(input),
		onSuccess: () => accounts.refetch(),
		onError: (e) => setError(accountError(e)),
	});
	const deleting = useMutation({
		mutationFn: (input: { id: string }) => client.harnessAccounts.remove(input),
		onSuccess: () => {
			setRemove(null);
			void accounts.refetch();
		},
	});
	const refresh = useMutation({
		mutationFn: (input: { id: string; refresh?: boolean }) => client.harnessAccounts.quota(input),
		onSuccess: (result) => {
			const index = values.findIndex((a) => a.id === result.accountId);
			void quotas[index]?.refetch();
		},
		onError: (e) => setError(accountError(e)),
	});
	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not copy the command.");
		}
	};
	return (
		<div className="flex min-w-0 flex-col gap-3 py-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-fg-muted">
					Select a default for each harness. Managers can select another enabled account for an assignment.
				</p>
				<Tooltip content="Add account">
					<IconButton
						label="Add agent account"
						onClick={() => {
							create.reset();
							setOpen(true);
						}}
						icon={<Plus />}
					/>
				</Tooltip>
			</div>
			{(error || accounts.isError) && (
				<p role="alert" className="text-sm text-danger">
					{error ?? accountError(accounts.error)}
				</p>
			)}
			{accounts.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load accounts…
				</p>
			) : values.length === 0 ? (
				<p className="text-sm text-fg-muted">No agent accounts. Add an account to select its login for workers.</p>
			) : (
				<div className="divide-y divide-border">
					{values.map((account, index) => (
						<HarnessAccountCard
							key={account.id}
							account={account}
							quota={quotas[index]?.data}
							busy={update.isPending || deleting.isPending}
							refreshing={quotas[index]?.isFetching || refresh.isPending}
							error={accountError(quotas[index]?.error)}
							onDefault={() => {
								setError(undefined);
								update.mutate({ id: account.id, isDefault: true });
							}}
							onEnabled={(enabled) => {
								setError(undefined);
								update.mutate({ id: account.id, enabled, ...(!enabled ? { isDefault: false } : {}) });
							}}
							onRemove={() => {
								deleting.reset();
								setRemove(account);
							}}
							onRefresh={() => refresh.mutate({ id: account.id, refresh: true })}
							onCopy={(text) => {
								void copy(text);
							}}
						/>
					))}
				</div>
			)}
			{open && (
				<HarnessAccountForm
					open={open}
					onClose={() => setOpen(false)}
					busy={create.isPending}
					error={accountError(create.error)}
					onSubmit={(input) => create.mutate(input)}
				/>
			)}
			<ConfirmDialog
				open={remove !== null}
				title={`Remove ${remove?.name ?? "account"}?`}
				description="This removes the account from Trellis. Its profile, credentials, and saved conversations remain on disk."
				confirmLabel="Remove account"
				processing={deleting.isPending}
				onCancel={() => setRemove(null)}
				onConfirm={() => remove && deleting.mutate({ id: remove.id })}
			>
				{deleting.error && (
					<p role="alert" className="text-sm text-danger">
						{accountError(deleting.error)}
					</p>
				)}
			</ConfirmDialog>
		</div>
	);
}
