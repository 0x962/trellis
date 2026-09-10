import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { BlockedNotice } from "../BlockedNotice";

export type BlockedAgentsProps = {
	// The project ref whose agents this list covers, such as "CDE". The
	// list covers the sub-projects too, because one manager serves the
	// whole tree.
	project: string;
};

// Every agent of one project that cannot work, with the action that
// clears it. A project whose agents all work shows nothing.
export function BlockedAgents({ project }: BlockedAgentsProps) {
	const { orpc } = useApp();
	const sessions = useQuery(orpc.agents.sessions.queryOptions({ input: { project } })).data?.sessions;
	const blocked = (sessions ?? []).filter((session) => session.state !== "stopped" && session.blocked !== null);
	if (blocked.length === 0) return null;

	return (
		<ul aria-label="Blocked agents" className="flex flex-col gap-2">
			{blocked.map((session) => (
				<li key={session.id}>
					<BlockedNotice session={session} />
				</li>
			))}
		</ul>
	);
}
