import { useQueries, useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

export function useNativeAttention() {
	const { orpc } = useApp();
	const runs = useQuery({ ...orpc.agentRuns.list.queryOptions({ input: {} }), refetchInterval: 3000 });
	const native =
		runs.data?.filter((run) => run.runtime === "native" && !["stopped", "exited"].includes(run.state)) ?? [];
	const harnesses = useQueries({
		queries: native.map((run) => ({
			...orpc.agentRuns.harness.queryOptions({ input: { id: run.id } }),
			refetchInterval: 3000,
			retry: false,
		})),
	});
	const items = native.flatMap((run, index) => {
		const query = harnesses[index]!;
		const current = query.data;
		const reason =
			run.error ??
			query.error?.message ??
			current?.error ??
			(current?.pendingPermissions.length
				? `${current.pendingPermissions.length} tool requests need your decision.`
				: current?.state === "unknown"
					? "The agent state is unknown."
					: run.state === "failed" || run.state === "interrupted"
						? "The execution attempt needs attention."
						: null);
		return reason ? [{ run, reason }] : [];
	});
	return { items, error: runs.error };
}
