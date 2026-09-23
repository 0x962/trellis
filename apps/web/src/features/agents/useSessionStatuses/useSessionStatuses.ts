import { useQuery } from "@tanstack/react-query";
import type { SessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { statusesBySessionId } from "../sessionStatuses";

// The status of every session that has a live run, by session id. The sidebar
// session list reads it to draw each row.
export function useSessionStatuses(): Record<string, SessionStatus> | undefined {
	const { data } = useQuery({
		...useApp().orpc.agentRuns.activity.queryOptions({ input: {} }),
		refetchInterval: 2000,
		select: statusesBySessionId,
	});
	return data;
}
