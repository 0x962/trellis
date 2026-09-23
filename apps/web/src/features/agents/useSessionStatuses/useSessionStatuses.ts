import { useQuery } from "@tanstack/react-query";
import type { SessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { agentActivityQuery } from "../agentActivityQuery";
import { statusesBySessionId } from "../statusesBySessionId";

// The key of each entry is the session id.
export function useSessionStatuses(): Record<string, SessionStatus> | undefined {
	const { orpc } = useApp();
	const { data } = useQuery({ ...agentActivityQuery(orpc), select: statusesBySessionId });
	return data;
}
