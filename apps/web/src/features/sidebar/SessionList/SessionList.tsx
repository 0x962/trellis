import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { type AgentActivity, type SessionStatus, sessionStatus } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { SessionRow } from "../components/SessionRow";

// The status of each session, by session id. agentRuns.activity also carries
// every ticket agent run, and those change often, so the rows here read this
// small object instead of the answer itself. A status changes rarely, so React
// Query keeps the last object and the rows below redraw on a status change
// alone.
const sessionStatuses = (entries: AgentActivity[]): Record<string, SessionStatus> =>
	Object.fromEntries(
		entries.flatMap((entry) =>
			entry.sessionId === null ? [] : [[entry.sessionId, sessionStatus(entry.run)] as const],
		),
	);

export function SessionList() {
	const { orpc, queryClient } = useApp();
	const sessionsOptions = orpc.sessions.list.queryOptions({ input: {} });
	const { data, failureCount } = useQuery(sessionsOptions);
	// agentRuns.activity carries the runs of the sessions here and the runs of
	// the ticket agents, which the dot on a project Sessions row counts. Both
	// readers share this one query.
	const { data: statuses } = useQuery({
		...orpc.agentRuns.activity.queryOptions({ input: {} }),
		refetchInterval: 2000,
		select: sessionStatuses,
	});
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	if (data === undefined)
		return (
			<nav aria-label="Sessions" data-session-list="">
				{failureCount > 0 && (
					<div role="status" className="flex h-8 items-center justify-between gap-2 pl-2 text-sm text-fg-muted">
						<span className="truncate">Could not load sessions</span>
						<Button
							variant="quiet"
							onClick={() => void queryClient.resetQueries({ queryKey: sessionsOptions.queryKey, exact: true })}
						>
							Retry
						</Button>
					</div>
				)}
			</nav>
		);
	if (data.length === 0) return <nav aria-label="Sessions" data-session-list="" />;
	return (
		<nav aria-label="Sessions" data-session-list="">
			<ul className="flex flex-col gap-0.5">
				{data
					.filter((session) => session.projectId === null)
					.map((session) => {
						const status = statuses?.[session.id] ?? "unavailable";
						return (
							<SessionRow
								key={session.id}
								session={session}
								status={status}
								workingCount={status === "working" ? 1 : 0}
								active={pathname === `/sessions/${session.id}`}
							/>
						);
					})}
			</ul>
		</nav>
	);
}
