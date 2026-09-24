import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Provider } from "@trellis/api";
import { ConfirmDialog, FailureState, IconButton, SectionHeader, Skeleton, Tooltip } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { accountError } from "../UsageAccounts/accountError";
import { UsageProviderCard } from "./components/UsageProviderCard";
import { UsageProviderForm } from "./components/UsageProviderForm";

export function UsageProviders() {
	const { client, orpc, queryClient } = useApp();
	const list = useQuery({ ...orpc.providers.list.queryOptions({ input: {} }), refetchInterval: 30_000 });
	const [add, setAdd] = useState(false);
	const [edit, setEdit] = useState<Provider | null>(null);
	const [remove, setRemove] = useState<Provider | null>(null);
	const section = useRef<HTMLElement>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const opener = useRef<HTMLElement | null>(null);
	const hash = useLocation({ select: (location) => location.hash });
	useEffect(() => {
		if (hash === "providers") section.current?.scrollIntoView({ block: "start" });
	}, [hash]);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.providers.list.key() });
	const invalidateProvider = async (provider: Provider) => {
		await Promise.all([
			invalidate(),
			queryClient.invalidateQueries({
				queryKey: orpc.providers.check.queryOptions({ input: { id: provider.id } }).queryKey,
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.providers.models.queryOptions({ input: { id: provider.id } }).queryKey,
			}),
		]);
	};
	const toggle = useMutation({
		mutationFn: (provider: Provider) => client.providers.update({ id: provider.id, enabled: !provider.enabled }),
		onSuccess: invalidateProvider,
	});
	const deleting = useMutation({
		mutationFn: (provider: Provider) => client.providers.delete({ id: provider.id }),
		onSuccess: async () => {
			setRemove(null);
			await invalidate();
		},
	});
	const firstCheck = useMutation({
		mutationFn: (provider: Provider) => client.providers.check({ id: provider.id, refresh: true }),
		onSuccess: (result, provider) =>
			queryClient.setQueryData(orpc.providers.check.queryOptions({ input: { id: provider.id } }).queryKey, result),
	});
	const saved = async (provider: Provider, created: boolean) => {
		if (created) {
			firstCheck.mutate(provider);
			await invalidate();
		} else {
			await invalidateProvider(provider);
		}
	};
	const busy = toggle.isPending || deleting.isPending;
	return (
		<section ref={section} aria-label="Providers" id="providers" className="flex flex-col gap-3">
			<SectionHeader
				title="Providers"
				count={list.isPending ? undefined : list.data?.length}
				actions={
					<Tooltip content="Add provider">
						<IconButton
							ref={addButton}
							label="Add provider"
							icon={<Plus />}
							disabled={busy}
							onClick={() => setAdd(true)}
						/>
					</Tooltip>
				}
			/>
			<p className="text-sm text-fg-muted">
				Add the model gateways that Trellis holds a key for. Trellis calls a provider itself, and a later release routes
				agents through one.
			</p>
			{list.isPending ? (
				<div role="status" aria-label="Load providers">
					<span className="sr-only">Load providers</span>
					<Skeleton height="h-32" />
				</div>
			) : list.isError ? (
				<FailureState
					variant="section"
					title="Trellis cannot read the providers."
					detail={list.error.message}
					action={
						<Tooltip content="Retry">
							<IconButton
								label="Retry"
								icon={<ArrowClockwise />}
								disabled={list.isFetching}
								onClick={() => void list.refetch()}
							/>
						</Tooltip>
					}
				/>
			) : list.data.length === 0 ? (
				<p className="text-sm text-fg-muted">No providers. Add a provider to give Trellis a key.</p>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{list.data.map((provider) => (
						<UsageProviderCard
							key={provider.id}
							provider={provider}
							busy={busy}
							onEdit={() => {
								opener.current = document.activeElement as HTMLElement;
								setEdit(provider);
							}}
							onRemove={() => {
								opener.current = document.activeElement as HTMLElement;
								deleting.reset();
								setRemove(provider);
							}}
							onToggle={() => toggle.mutate(provider)}
						/>
					))}
				</div>
			)}
			{(toggle.error || firstCheck.error) && (
				<p role="alert" className="text-sm text-danger">
					{accountError(toggle.error ?? firstCheck.error)}
				</p>
			)}
			{add && <UsageProviderForm onClose={() => setAdd(false)} onSaved={saved} finalFocus={addButton} />}
			{edit && (
				<UsageProviderForm
					key={edit.id}
					provider={edit}
					onClose={() => setEdit(null)}
					onSaved={saved}
					finalFocus={opener}
				/>
			)}
			<ConfirmDialog
				open={remove !== null}
				title={`Remove ${remove?.name ?? "provider"}?`}
				description="Trellis forgets the key of this provider. Nothing at the provider changes."
				confirmLabel="Remove provider"
				danger
				processing={deleting.isPending}
				finalFocus={() => (opener.current?.isConnected ? opener.current : addButton.current)}
				onCancel={() => {
					if (!deleting.isPending) setRemove(null);
				}}
				onConfirm={() => {
					if (remove) deleting.mutate(remove);
				}}
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
