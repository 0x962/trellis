import { useQuery } from "@tanstack/react-query";
import type { AgentSession, Project } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { AgentStateBadge } from "../AgentStateBadge";
import { BlockedNotice } from "../BlockedNotice";
import { OpenInSuperset } from "../OpenInSuperset";

export type ManagerStatusProps = {
	project: Project;
};

const newest = (sessions: AgentSession[]) =>
	sessions.reduce<AgentSession | undefined>(
		(best, session) => (best === undefined || session.createdAt > best.createdAt ? session : best),
		undefined,
	);

// The manager of the project's root, for the project header. One manager
// serves the whole tree, so a sub-project shows its root's manager. No
// manager session, or a stopped one, reads Off. `lastWokenAt` is the time
// the manager got its last batch. An agents.session event refetches
// agents.sessions, so the badge follows the manager live.
//
// A manager that cannot work shows the reason and the one action that
// clears it. The badge alone once read Off for a manager that waited at
// the folder question of its agent command line.
export function ManagerStatus({ project }: ManagerStatusProps) {
	const { orpc } = useApp();
	const root = project.ancestors[0]?.path ?? project.path;
	const sessions = useQuery(orpc.agents.sessions.queryOptions({ input: { project: root } })).data?.sessions;
	if (sessions === undefined) return null;
	const manager = newest(sessions.filter((session) => session.role === "manager"));
	const on = manager !== undefined && manager.state !== "stopped";

	// A manager a person stopped shows no reason: the person stopped it.
	const blocked = on && manager.blocked !== null;

	return (
		<fieldset aria-label="Manager" className="flex min-w-0 flex-col gap-1 text-sm md:flex-row md:items-center md:gap-2">
			<div className="flex min-w-0 items-center gap-2">
				<span className="hidden text-fg-muted md:inline">Manager</span>
				<AgentStateBadge state={on ? manager.state : "off"} />
				{on && !blocked && (
					<span className="hidden text-fg-faint tabular md:inline">
						{manager.lastWokenAt === null ? "No batch yet" : `Last batch ${relativeTime(manager.lastWokenAt)}`}
					</span>
				)}
				{on && manager.openUrl !== null && <OpenInSuperset url={manager.openUrl} />}
			</div>
			{blocked && <BlockedNotice session={manager} />}
		</fieldset>
	);
}
