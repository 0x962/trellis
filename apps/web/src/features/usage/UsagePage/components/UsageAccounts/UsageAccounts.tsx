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
	Button,
	ConfirmDialog,
	EmptyState,
	FailureState,
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
	const [addOpen, setAddOpen] = useState(false);
	const [edit, setEdit] = useState<HarnessAccount | null>(null);
	const [remove, setRemove] = useState<HarnessAccount | null>(null);
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
			queryClient.setQueryData(accountOptions.queryKey, next);
		},
	});
	const busy = create.isPending || update.isPending || deleting.isPending;
	const readFailure = configured.isError
		? { title: "Trellis cannot read the account settings", detail: configured.error.message }
		: accounts.isError
			? { title: "Trellis cannot read the account quotas", detail: accounts.error.message }
			: null;
	const mutationFailure = refresh.error
		? { title: "Trellis could not refresh the account quotas", detail: accountError(refresh.error) }
		: update.error && edit === null
			? { title: "Trellis could not update the account", detail: accountError(update.error) }
			: null;
	const failure = readFailure ?? mutationFailure;
	const retry = () => {
		if (readFailure) {
			void Promise.all([accounts.refetch(), configured.refetch()]);
			return;
		}
		if (refresh.error) {
			refresh.mutate();
			return;
		}
		update.mutate(update.variables!);
	};

	return (
		<section aria-label="Accounts" className="flex flex-col gap-3">
			<SectionHeader
				title="Accounts"
				count={accounts.isPending || configured.isPending ? undefined : values.length}
				actions={
					<Tooltip content="Add account">
						<IconButton
							label="Add account"
							disabled={busy}
							onClick={() => {
								create.reset();
								setAddOpen(true);
							}}
							icon={<Plus />}
						/>
					</Tooltip>
				}
			/>
			<p className="-mt-1 max-w-prose text-xs text-fg-faint text-pretty">
				Add the accounts that agents can use. Select one default account for each harness.
			</p>
			{failure && (
				<FailureState
					variant="section"
					title={failure.title}
					detail={failure.detail}
					action={
						<Button
							size="md"
							processing={accounts.isFetching || configured.isFetching || refresh.isPending || update.isPending}
							onClick={retry}
						>
							Try again
						</Button>
					}
				/>
			)}
			{accounts.isPending || configured.isPending ? (
				<div role="status" aria-label="Load accounts" className="status-group">
					<span className="sr-only">Load accounts</span>
					{[0, 1, 2].map((slot) => (
						<div key={slot} className="status-row p-3">
							<Skeleton height="h-8" />
						</div>
					))}
				</div>
			) : values.length === 0 ? (
				<EmptyState
					title="No accounts"
					description="Add an account so an agent can sign in to a harness on this machine."
				/>
			) : (
				<ul className="status-group">
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
									update.mutate({ id: managed!.id, isDefault: true });
								}}
								onRename={() => {
									update.reset();
									setEdit(managed!);
								}}
								onRemove={() => {
									deleting.reset();
									setRemove(managed!);
								}}
								onRefresh={() => {
									refresh.reset();
									refresh.mutate();
								}}
							/>
						);
					})}
				</ul>
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
