import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";

// The agent run that is assigned to the ticket, or undefined when the ticket
// has no assigned agent. Every caller reads the one `agentRuns.list
// { assigned: true }` query that `useWorkingAgents` also reads, so a list of
// rows sends one request, not one request per row. The run kind is `agent`,
// the kind the ticket page shows as the assigned agent.
export function useAssignedRun(ticketId: string) {
	const { orpc } = useApp();
	return useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		select: (runs) => runs.find((run) => run.ticketId === ticketId && run.kind === "agent"),
	}).data;
}
