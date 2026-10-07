import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { assignedAgentRunsOptions } from "../assignedAgentRuns";

// Ticket controls share the assigned-run query and wait for its result before they permit a start.
export function useAssignedRun(ticketId: string) {
	const { orpc, client } = useApp();
	return useQuery({
		...assignedAgentRunsOptions(orpc, client),
		select: (page) => page.items.find((run) => run.ticketId === ticketId && run.kind === "agent") ?? null,
		refetchOnWindowFocus: "always",
	});
}
