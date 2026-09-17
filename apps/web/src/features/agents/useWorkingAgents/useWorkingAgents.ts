import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { workingTargets } from "../workingTargets";

const empty = { ticketIds: [], projectIds: [], runIds: [] };

export function useWorkingAgents() {
	const { orpc } = useApp();
	const query = useQuery({ ...orpc.agentRuns.list.queryOptions({ input: {} }), select: workingTargets });
	return query.data ?? empty;
}
