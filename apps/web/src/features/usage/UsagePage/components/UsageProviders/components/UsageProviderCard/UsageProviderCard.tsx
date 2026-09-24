import { useMutation, useQuery } from "@tanstack/react-query";
import type { Provider } from "@trellis/api";
import { ProviderCard } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { accountError } from "../../../UsageAccounts/accountError";

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
	return (
		<ProviderCard
			provider={provider}
			check={check.data}
			checking={check.isFetching || refresh.isPending}
			busy={busy}
			error={accountError(refresh.error ?? check.error)}
			onEdit={onEdit}
			onRemove={onRemove}
			onToggle={onToggle}
			onCheck={() => refresh.mutate()}
		/>
	);
}
