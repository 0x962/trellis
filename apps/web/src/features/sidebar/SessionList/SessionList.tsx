import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { useSessionStatuses } from "../../agents/useSessionStatuses";
import { SessionRow } from "../components/SessionRow";

export function SessionList() {
	const { orpc, queryClient } = useApp();
	const sessionsOptions = orpc.sessions.list.queryOptions({ input: {} });
	const { data, failureCount } = useQuery(sessionsOptions);
	const statuses = useSessionStatuses();
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
								active={pathname === `/sessions/${session.id}`}
							/>
						);
					})}
			</ul>
		</nav>
	);
}
