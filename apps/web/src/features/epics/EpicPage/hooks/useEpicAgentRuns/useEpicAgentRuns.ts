import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../../lib/appContext";

export const useEpicAgentRuns = (epic: string) => {
	const { orpc } = useApp();
	return useQuery({
		...orpc.agentRuns.latestByEpicTicket.queryOptions({ input: { epic } }),
		refetchOnWindowFocus: "always",
	});
};
