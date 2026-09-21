import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { sessionStatus } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { SessionRow } from "../components/SessionRow";

export function SessionList() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const activity = useQuery({ ...orpc.sessions.activity.queryOptions({ input: {} }), refetchInterval: 2000 });
	const runs = new Map(activity.data?.map((session) => [session.id, session.run]));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	if (data === undefined || data.length === 0) return <nav aria-label="Sessions" data-session-list="" />;
	return (
		<nav aria-label="Sessions" data-session-list="">
			<ul className="flex flex-col gap-0.5">
				{data
					.filter((session) => session.projectId === null)
					.map((session) => {
						const run = runs.get(session.id);
						return (
							<SessionRow
								key={session.id}
								session={session}
								status={run ? sessionStatus(run) : "unavailable"}
								activityAt={run?.observation?.activity?.updatedAt ?? run?.updatedAt ?? session.updatedAt}
								workingCount={run && sessionStatus(run) === "working" ? 1 : 0}
								active={pathname === `/sessions/${session.id}`}
							/>
						);
					})}
			</ul>
		</nav>
	);
}
