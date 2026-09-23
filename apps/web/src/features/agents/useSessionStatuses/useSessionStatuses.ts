import { useQuery } from "@tanstack/react-query";
import type { SessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { agentActivityQuery } from "../agentActivityQuery";
import { statusesBySessionId } from "../statusesBySessionId";

// useActiveAgentCounts asks React Query for the same key, so both hooks share
// one fetch and one 2 second poll.
export function useSessionStatuses(): Record<string, SessionStatus> | undefined {
	const { orpc } = useApp();
	const { data } = useQuery({ ...agentActivityQuery(orpc), select: statusesBySessionId });
	return data;
}
