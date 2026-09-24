import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useApp } from "../../../lib/appContext";
import { useSessionStatuses } from "../../agents/useSessionStatuses";
import { ArchivedGroup } from "../components/ArchivedGroup";
import { SessionRow } from "../components/SessionRow";
import { archivedSessions, sidebarSessionsQuery } from "../sidebarSessions";

export function ArchivedSessions() {
	const { orpc } = useApp();
	const { data } = useQuery(sidebarSessionsQuery(orpc));
	const statuses = useSessionStatuses();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	// The Sessions section above reads the same query, and it prints the
	// failure and the Retry button for both sections. This section draws
	// nothing until that query answers, so an empty group states one fact: the
	// person archived no session.
	if (data === undefined) return null;
	const rows = archivedSessions(data);
	if (rows.length === 0) return null;
	return (
		<ArchivedGroup label="Archived sessions" count={rows.length}>
			<ul className="flex flex-col gap-0.5">
				{rows.map((session) => (
					<SessionRow
						key={session.id}
						session={session}
						status={statuses?.[session.id] ?? "unavailable"}
						active={pathname === `/sessions/${session.id}`}
					/>
				))}
			</ul>
		</ArchivedGroup>
	);
}
