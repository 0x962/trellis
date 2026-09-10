import { useQuery } from "@tanstack/react-query";
import type { AgentSession, Project } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { AgentFailure } from "../AgentFailure";
import { AgentStateBadge } from "../AgentStateBadge";
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
// manager session, or a stopped one, reads Off. A manager whose start the
// runner refused reads Failed and states why, so a header that reads Off
// never hides a refusal. `lastWokenAt` is the time the manager got its last
// batch. An agents.session event refetches agents.sessions, so the badge
// follows the manager live.
export function ManagerStatus({ project }: ManagerStatusProps) {
	const { orpc } = useApp();
	const root = project.ancestors[0]?.path ?? project.path;
	const sessions = useQuery(orpc.agents.sessions.queryOptions({ input: { project: root } })).data?.sessions;
	if (sessions === undefined) return null;
	const manager = newest(sessions.filter((session) => session.role === "manager"));
	const on = manager !== undefined && manager.state !== "stopped";
	const failed = manager !== undefined && manager.failure !== null;

	return (
		<fieldset aria-label="Manager" className="flex min-w-0 items-center gap-2 text-sm">
			<span className="hidden text-fg-muted md:inline">Manager</span>
			<AgentStateBadge state={on ? manager.state : "off"} />
			{on && !failed && (
				<span className="hidden text-fg-faint tabular md:inline">
					{manager.lastWokenAt === null ? "No batch yet" : `Last batch ${relativeTime(manager.lastWokenAt)}`}
				</span>
			)}
			{on && !failed && manager.openUrl !== null && <OpenInSuperset url={manager.openUrl} />}
			{failed && <AgentFailure session={manager} />}
		</fieldset>
	);
}
