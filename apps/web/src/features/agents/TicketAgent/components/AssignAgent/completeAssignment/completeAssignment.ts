import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";

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
		queryClient.setQueryData<readonly AgentRun[]>(queryKey, (current) =>
			current === undefined ? undefined : [run, ...current.filter((item) => item.id !== run.id)],
		);
	}
	invalidateRuns();
};
