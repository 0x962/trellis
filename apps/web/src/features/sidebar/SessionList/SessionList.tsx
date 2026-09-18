import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { sessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { SessionRow } from "../components/SessionRow";

export function SessionList() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const activity = useQuery(orpc.sessions.activity.queryOptions({ input: {} }));
	const runs = new Map(activity.data?.map((session) => [session.id, session.run]));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	if (data === undefined || data.length === 0) return <nav aria-label="Sessions" data-session-list="" />;
	return (
		<nav aria-label="Sessions" data-session-list="">
			<ul className="flex flex-col gap-0.5">
				{data
					.filter((session) => session.projectId === null)
					.map((session) => (
						<SessionRow
							key={session.id}
							session={session}
							status={runs.has(session.id) ? sessionStatus(runs.get(session.id)!) : "unavailable"}
							active={pathname === `/sessions/${session.id}`}
						/>
					))}
			</ul>
		</nav>
	);
}
