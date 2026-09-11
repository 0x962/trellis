import { useQuery } from "@tanstack/react-query";
import type { AgentSession, Project } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentFailure } from "../AgentFailure";
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
// serves the whole tree, so a sub-project shows its root's manager. The
// header stays empty while the manager works. Only a manager the runner
// could not start appears, with the reason and a Retry that asks the server
// to start it again. The Agents page carries the running state and the
// batch times.
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
	if (manager === undefined || manager.state !== "failed") return null;

	return (
		<fieldset aria-label="Manager" className="flex min-w-0 items-center gap-2 text-sm">
			<AgentFailure id={manager.id} error={manager.error} lead="Manager failed: " />
			<Button size="sm" className="cursor-pointer" disabled={retrying} onClick={() => void retry()}>
				Retry
			</Button>
		</fieldset>
	);
}
