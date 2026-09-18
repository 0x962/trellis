import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
	HarnessAccount,
	HarnessAccountCreate,
	HarnessAccountUpdate,
	UsageAccount,
	UsageGroupRow,
	UsageMetric,
} from "@trellis/api";
import {
	ConfirmDialog,
	HarnessAccountForm,
	HarnessAccountNameForm,
	IconButton,
	SectionHeader,
	Skeleton,
	Tooltip,
} from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { accountError } from "./accountError";
import { UsageAccountCard } from "./components/UsageAccountCard";

export type UsageAccountsProps = {
	rows: readonly UsageGroupRow[];
	metric: UsageMetric;
	total: number;
	pending: boolean;
};

export const unavailableUsageAccounts = (accounts: readonly HarnessAccount[]): UsageAccount[] =>
	accounts.map((account) => ({
		key: `account:${account.name}`,
		id: account.id,
		name: account.name,
		harness: account.harness,
		profilePath: account.profilePath,
		isDefault: account.isDefault,
		defaultSource: null,
		loginCommand: account.loginCommand,
		sharedWith: [],
		quota: {
			status: "unavailable",
			email: null,
			plan: null,
			detail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			fetchedAt: account.updatedAt,
		},
	}));

export function UsageAccounts({ rows, metric, total, pending }: UsageAccountsProps) {
	const { orpc, client, queryClient } = useApp();
	const accountOptions = orpc.usage.accounts.queryOptions({ input: {} });
	const accounts = useQuery({ ...accountOptions, refetchInterval: 30_000 });
	const configured = useQuery({
		...orpc.harnessAccounts.list.queryOptions({ input: {} }),
		refetchInterval: 30_000,
	});
	const values = accounts.isError ? unavailableUsageAccounts(configured.data ?? []) : (accounts.data ?? []);
	const readError = accounts.isError
		? "Could not read account quotas. Select Refresh quota to try again."
		: configured.isError
			? "Could not read the configured accounts. Refresh the page to try again."
			: undefined;
	const [addOpen, setAddOpen] = useState(false);
	const [edit, setEdit] = useState<HarnessAccount | null>(null);
	const [remove, setRemove] = useState<HarnessAccount | null>(null);
	const [error, setError] = useState<string>();
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.harnessAccounts.list.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.usage.accounts.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.usage.report.key() }),
		]);
	const create = useMutation({
		mutationFn: (input: HarnessAccountCreate) => client.harnessAccounts.create(input),
		onSuccess: async () => {
			setAddOpen(false);
			await invalidate();
		},
	});
	const update = useMutation({
		mutationFn: (input: HarnessAccountUpdate) => client.harnessAccounts.update(input),
		onSuccess: async () => {
			setEdit(null);
			await invalidate();
		},
		onError: (nextError) => setError(accountError(nextError)),
	});
	const deleting = useMutation({
		mutationFn: (input: { id: string }) => client.harnessAccounts.remove(input),
		onSuccess: async () => {
			setRemove(null);
			await invalidate();
		},
	});
	const refresh = useMutation({
		mutationFn: () => client.usage.accounts({ refresh: true }),
		onSuccess: (next) => {
			setError(undefined);
			queryClient.setQueryData(accountOptions.queryKey, next);
		},
		onError: (nextError) => setError(accountError(nextError)),
	});
	const busy = create.isPending || update.isPending || deleting.isPending;

	return (
		<section aria-label="Accounts" className="flex flex-col gap-3">
			<SectionHeader
				title="Accounts"
				count={accounts.isPending || configured.isPending ? undefined : values.length}
				actions={
					<Tooltip content="Add account">
						<IconButton
							label="Add agent account"
							disabled={busy}
							onClick={() => {
								setError(undefined);
								create.reset();
								setAddOpen(true);
							}}
							icon={<Plus />}
						/>
					</Tooltip>
				}
			/>
			<p className="text-sm text-fg-muted">
				Add and manage the logins that agents can use. Select one default account for each harness.
			</p>
			{(error || accounts.isError || configured.isError) && (
				<p role="alert" className="text-sm text-danger">
					{error ?? readError}
				</p>
			)}
			{accounts.isPending || configured.isPending ? (
				<div role="status" aria-label="Load accounts">
					<span className="sr-only">Load accounts</span>
					<Skeleton height="h-32" />
				</div>
			) : values.length === 0 ? (
				<p className="text-sm text-fg-muted">No agent accounts. Add an account for agent assignments.</p>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{values.map((account) => {
						const managed = configured.data?.find((candidate) => candidate.id === account.id);
						const shared = account.sharedWith.length
							? rows.find((candidate) => candidate.key === `shared:${account.harness}`)
							: undefined;
						return (
							<UsageAccountCard
								key={account.key}
								account={account}
								managed={managed}
								row={rows.find((candidate) => candidate.key === account.key)}
								shared={shared}
								metric={metric}
								total={total}
								pending={pending}
								busy={busy}
								refreshing={refresh.isPending}
								onDefault={() => {
									setError(undefined);
									update.mutate({ id: managed!.id, isDefault: true });
								}}
								onRename={() => {
									setError(undefined);
									update.reset();
									setEdit(managed!);
								}}
								onRemove={() => {
									setError(undefined);
									deleting.reset();
									setRemove(managed!);
								}}
								onRefresh={() => {
									setError(undefined);
									refresh.mutate();
								}}
							/>
						);
					})}
				</div>
			)}
			{addOpen && (
				<HarnessAccountForm
					open={addOpen}
					onClose={() => setAddOpen(false)}
					busy={create.isPending}
					error={accountError(create.error)}
					onSubmit={(input) => create.mutate(input)}
				/>
			)}
			{edit && (
				<HarnessAccountNameForm
					key={edit.id}
					open
					name={edit.name}
					busy={update.isPending}
					error={accountError(update.error)}
					onClose={() => setEdit(null)}
					onSubmit={(name) => update.mutate({ id: edit.id, name })}
				/>
			)}
			<ConfirmDialog
				open={remove !== null}
				title={`Remove ${remove?.name ?? "account"}?`}
				description="This removes the account from Trellis. Its profile, credentials, and saved conversations remain on disk."
				confirmLabel="Remove account"
				danger
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
		</section>
	);
}
