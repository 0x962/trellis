import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";

// Ticket controls share the assigned-run query and wait for its result before they permit a start.
export function useAssignedRun(ticketId: string) {
	const { orpc } = useApp();
	return useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		select: (page) => page.items.find((run) => run.ticketId === ticketId && run.kind === "agent") ?? null,
		refetchOnWindowFocus: "always",
	});
}
