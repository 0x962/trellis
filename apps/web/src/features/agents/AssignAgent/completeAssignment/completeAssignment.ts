import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AgentRun, AgentRunListOutput } from "@trellis/api";

export const completeAssignment = ({
	queryClient,
	queryKeys,
	run,
	rememberChoice,
	clearStart,
	invalidateRuns,
}: {
	queryClient: QueryClient;
	queryKeys: readonly QueryKey[];
	run: AgentRun;
	rememberChoice: () => void;
	clearStart: () => void;
	invalidateRuns: () => void;
}): void => {
	rememberChoice();
	clearStart();
	for (const queryKey of queryKeys) {
		queryClient.setQueryData<readonly AgentRun[] | AgentRunListOutput>(queryKey, (current) => {
			if (current === undefined) return undefined;
			if ("items" in current)
				return { ...current, items: [run, ...current.items.filter((item) => item.id !== run.id)] };
			return [run, ...current.filter((item) => item.id !== run.id)];
		});
	}
	invalidateRuns();
};
