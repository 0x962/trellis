import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useApp } from "../../../lib/appContext";
import { useWorkingAgents } from "../../agents/useWorkingAgents";
import { SessionRow } from "../components/SessionRow";

// The sessions, newest first. Each row opens its session page. The work
// state comes from the agent runs the sidebar already reads for the
// project tree, so the list itself refetches on session events only.
//
// The active row follows the page the outlet shows, not the URL of a
// navigation that is still loading, so the highlight and the page match.
export function SessionList() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const { runIds } = useWorkingAgents();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	if (data === undefined || data.length === 0) return <nav aria-label="Sessions" data-session-list="" />;
	return (
		<nav aria-label="Sessions" data-session-list="">
			<ul className="flex flex-col gap-0.5">
				{data.map((session) => (
					<SessionRow
						key={session.id}
						session={session}
						working={runIds.includes(session.runId)}
						active={pathname === `/sessions/${session.id}`}
					/>
				))}
			</ul>
		</nav>
	);
}
