import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PageSummary } from "@trellis/api";
import { FailureState, Select, toast } from "@trellis/ui";
import { useEffect, useMemo } from "react";
import { useApp } from "../../../../../lib/appContext";

export function PageWatcher({ page, disabled }: { page: PageSummary; disabled: boolean }) {
	const { orpc } = useApp();
	const client = useQueryClient();
	const agents = useInfiniteQuery({
		...orpc.pages.watcherOptions.infiniteOptions({
			input: (cursor: string | undefined) => ({ page: page.id, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (result) => result.nextCursor ?? undefined,
		}),
		enabled: !disabled,
	});
	useEffect(() => {
		if (agents.hasNextPage && !agents.isFetchingNextPage) void agents.fetchNextPage();
	}, [agents.fetchNextPage, agents.hasNextPage, agents.isFetchingNextPage]);
	const mutation = useMutation({
		mutationFn: (agentId: string) =>
			orpc.pages.watch.call({ page: page.id, agentId: agentId === "none" ? null : agentId }),
		onSuccess: () => client.invalidateQueries({ queryKey: orpc.pages.key() }),
		onError: (error) => toast.error(error.message),
	});
	const items = useMemo(() => {
		const options = [
			{ value: "none", label: "No watcher" },
			...(agents.data?.pages.flatMap((result) => result.items) ?? []).map((agent) => ({
				value: agent.id,
				label: agent.name,
			})),
		];
		if (page.watcher !== null && !options.some((item) => item.value === page.watcher!.agent.id))
			options.push({ value: page.watcher.agent.id, label: page.watcher.agent.name });
		return options;
	}, [agents.data, page.watcher]);
	return (
		<div className="flex items-center gap-2">
			<Select
				label="Page watcher"
				items={items}
				value={page.watcher?.agent.id ?? "none"}
				onValueChange={(id) => mutation.mutate(id)}
				disabled={
					disabled ||
					agents.isPending ||
					agents.isError ||
					agents.hasNextPage ||
					agents.isFetchingNextPage ||
					mutation.isPending
				}
			/>
			{agents.isError && <FailureState variant="inline" title="Agents did not load." />}
		</div>
	);
}
