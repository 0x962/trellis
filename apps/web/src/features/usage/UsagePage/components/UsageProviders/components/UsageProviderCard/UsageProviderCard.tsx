import { ArrowClockwise, DotsThree, PencilSimple, Power, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Provider, ProviderCheck } from "@trellis/api";
import { IconButton, Menu, ProviderIcon, SettingsListRow, Tooltip } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { accountError } from "../../../UsageAccounts/accountError";

export const providerCheckSummary = ({
	provider,
	check,
	checking,
	error,
}: {
	provider: Provider;
	check?: ProviderCheck;
	checking: boolean;
	error?: string;
}) => {
	const models = `${provider.models.length} ${provider.models.length === 1 ? "model" : "models"}`;
	if (checking) return `Checking the key… · ${models}`;
	if (error) return `Key check failed · ${models}`;
	if (check?.ok) return `Key accepted${check.balance === null ? "" : ` · $${check.balance} left`} · ${models}`;
	if (check) return `Key refused · ${models}`;
	return `Key not checked · ${models}`;
};

export function UsageProviderRow({
	provider,
	check,
	checking,
	busy,
	error,
	onCheck,
	onEdit,
	onRemove,
	onToggle,
}: {
	provider: Provider;
	check?: ProviderCheck;
	checking: boolean;
	busy: boolean;
	error?: string;
	onCheck: () => void;
	onEdit: () => void;
	onRemove: () => void;
	onToggle: () => void;
}) {
	return (
		<SettingsListRow
			label={`${provider.name} · ${provider.enabled ? "On" : "Off"}`}
			description={providerCheckSummary({ provider, check, checking, error })}
			icon={
				<ProviderIcon
					provider={provider.kind === "vercel-ai-gateway" ? "vercel" : "openai-compatible"}
					decorative
					className="text-fg-muted"
				/>
			}
			disabled={busy}
			onEdit={onEdit}
			actions={
				<div className="flex shrink-0 items-center gap-1">
					<Tooltip content="Check">
						<IconButton
							label={`Check ${provider.name}`}
							icon={<ArrowClockwise />}
							processing={checking}
							disabled={busy}
							onClick={onCheck}
						/>
					</Tooltip>
					<Menu
						label={`Actions for ${provider.name}`}
						triggerTooltip={`Actions for ${provider.name}`}
						trigger={<IconButton label={`Actions for ${provider.name}`} icon={<DotsThree />} disabled={busy} />}
						items={[
							{ label: "Edit", icon: <PencilSimple />, onSelect: onEdit },
							{
								label: provider.enabled ? "Turn off" : "Turn on",
								icon: <Power />,
								onSelect: onToggle,
							},
							{ label: "Remove", icon: <Trash />, danger: true, onSelect: onRemove },
						]}
					/>
				</div>
			}
		/>
	);
}

export function UsageProviderCard({
	provider,
	busy,
	onEdit,
	onRemove,
	onToggle,
}: {
	provider: Provider;
	busy: boolean;
	onEdit: () => void;
	onRemove: () => void;
	onToggle: () => void;
}) {
	const { orpc, client, queryClient } = useApp();
	const options = orpc.providers.check.queryOptions({ input: { id: provider.id } });
	const check = useQuery({ ...options, staleTime: 30_000 });
	const refresh = useMutation({
		mutationFn: () => client.providers.check({ id: provider.id, refresh: true }),
		onSuccess: (result) => queryClient.setQueryData(options.queryKey, result),
	});
	const checking = check.isFetching || refresh.isPending;
	const error = accountError(refresh.error ?? check.error);
	return (
		<UsageProviderRow
			provider={provider}
			check={check.data}
			checking={checking}
			busy={busy}
			error={error}
			onCheck={() => refresh.mutate()}
			onEdit={onEdit}
			onRemove={onRemove}
			onToggle={onToggle}
		/>
	);
}
