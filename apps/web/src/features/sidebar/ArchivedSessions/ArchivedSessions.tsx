import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useApp } from "../../../lib/appContext";
import { useSessionStatuses } from "../../agents/useSessionStatuses";
import { ArchivedGroup } from "../components/ArchivedGroup";
import { archivedSessions, sidebarSessionsQuery } from "../sidebarSessions";
import { ArchivedSessionRows } from "./components/ArchivedSessionRows";

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
			<ArchivedSessionRows sessions={rows} statuses={statuses} pathname={pathname} />
		</ArchivedGroup>
	);
}
