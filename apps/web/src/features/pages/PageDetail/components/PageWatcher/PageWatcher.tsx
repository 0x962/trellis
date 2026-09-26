import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageSummary } from "@trellis/api";
import { Select, toast } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";

export function PageWatcher({ page, disabled }: { page: PageSummary; disabled: boolean }) {
	const { orpc } = useApp();
	const client = useQueryClient();
	const agents = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: page.projectId, assigned: true, limit: 1000 } }),
		enabled: !disabled,
	});
	const mutation = useMutation({
		mutationFn: (agentId: string) =>
			orpc.pages.watch.call({ page: page.id, agentId: agentId === "none" ? null : agentId }),
		onSuccess: () => client.invalidateQueries({ queryKey: orpc.pages.key() }),
		onError: (error) => toast.error(error.message),
	});
	const items = [
		{ value: "none", label: "No watcher" },
		...(agents.data ?? [])
			.filter((agent) => agent.runtime === "native" && agent.kind !== "flow")
			.map((agent) => ({ value: agent.id, label: agent.name })),
	];
	if (page.watcher !== null && !items.some((item) => item.value === page.watcher!.agent.id))
		items.push({ value: page.watcher.agent.id, label: page.watcher.agent.name });
	return (
		<div className="flex items-center gap-2">
			<Select
				label="Page watcher"
				items={items}
				value={page.watcher?.agent.id ?? "none"}
				onValueChange={(id) => mutation.mutate(id)}
				disabled={disabled || agents.isPending || agents.isError || mutation.isPending}
			/>
			{agents.isError && <span role="status">Agents did not load.</span>}
		</div>
	);
}
