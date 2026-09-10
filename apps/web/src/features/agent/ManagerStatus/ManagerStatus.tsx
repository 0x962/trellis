import { useQuery } from "@tanstack/react-query";
import type { AgentSession, Project } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { AgentFailure } from "../AgentFailure";
import { AgentStateBadge } from "../AgentStateBadge";
import { OpenInSuperset } from "../OpenInSuperset";
import { runnerRefusal } from "../utils/runnerRefusal";

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
// manager session, or a stopped one, reads Off. A manager the runner could
// not start reads why, and Retry asks the server to start it again.
// `lastWokenAt` is the time the manager got its last batch. An
// agents.session event refetches agents.sessions, so the badge follows the
// manager live.
export function ManagerStatus({ project }: ManagerStatusProps) {
	const { client, orpc, queryClient } = useApp();
	const root = project.ancestors[0]?.path ?? project.path;
	const options = orpc.agents.sessions.queryOptions({ input: { project: root } });
	const sessions = useQuery(options).data?.sessions;
	const [retrying, setRetrying] = useState(false);

	const retry = async () => {
		setRetrying(true);
		try {
			const session = await client.agents.retryManager({ project: root });
			queryClient.setQueryData(options.queryKey, (current) => ({
				sessions: [...(current?.sessions ?? []).filter((entry) => entry.id !== session.id), session],
			}));
		} catch (error) {
			toast.error("Couldn't start the manager", { description: runnerRefusal(error) });
		} finally {
			setRetrying(false);
		}
	};

	if (sessions === undefined) return null;
	const manager = newest(sessions.filter((session) => session.role === "manager"));
	const failed = manager !== undefined && manager.state === "failed";
	const on = manager !== undefined && manager.state !== "stopped" && !failed;

	return (
		<fieldset aria-label="Manager" className="flex min-w-0 items-center gap-2 text-sm">
			<span className="hidden text-fg-muted md:inline">Manager</span>
			{failed ? (
				<>
					<AgentFailure id={manager.id} error={manager.error} lead="Manager failed: " />
					<Button size="sm" className="cursor-pointer" disabled={retrying} onClick={() => void retry()}>
						Retry
					</Button>
				</>
			) : (
				<AgentStateBadge state={on ? manager.state : "off"} />
			)}
			{on && (
				<span className="hidden text-fg-faint tabular md:inline">
					{manager.lastWokenAt === null ? "No batch yet" : `Last batch ${relativeTime(manager.lastWokenAt)}`}
				</span>
			)}
			{on && manager.openUrl !== null && <OpenInSuperset url={manager.openUrl} />}
		</fieldset>
	);
}
