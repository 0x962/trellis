import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { isAgentWorking } from "../isAgentWorking";

export type WorkspaceSummaryRun = Pick<AgentRun, "id" | "runtime" | "workspaceId" | "processStatus" | "observation">;

// The Git state of the workspace of one run. Every caller for one run
// shares one cache entry, so a row and a header never show two numbers.
//
// The server runs Git for each read, and one read of a large repository
// takes more than a second. So the entry refreshes every 15 s only while
// the agent works, and once more when a turn starts or ends. `focus` adds
// a refresh when the window regains focus and the entry is older than
// 30 s; the selected session sets it, a list row does not. A row that
// mounts with an entry younger than a minute reads nothing.
export function useWorkspaceSummary(run: WorkspaceSummaryRun, options: { enabled?: boolean; focus?: boolean } = {}) {
	const { orpc } = useApp();
	const working = isAgentWorking(run);
	const enabled = (options.enabled ?? true) && run.runtime === "native" && run.workspaceId !== null;
	const query = useQuery({
		...orpc.agentRuns.workspaceSummary.queryOptions({ input: { runId: run.id } }),
		enabled,
		refetchInterval: working ? 15000 : false,
		staleTime: options.focus ? 30000 : 60000,
		refetchOnWindowFocus: options.focus ?? false,
	});
	const turn = `${run.observation?.turnId ?? ""}:${working}`;
	const seen = useRef(turn);
	const refetch = query.refetch;
	useEffect(() => {
		if (seen.current === turn) return;
		seen.current = turn;
		if (enabled) void refetch({ cancelRefetch: false });
	}, [turn, enabled, refetch]);
	return query;
}
