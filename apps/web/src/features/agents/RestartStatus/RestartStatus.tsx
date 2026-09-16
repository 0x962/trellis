import { useMutation, useQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { Badge, Button } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

// After a desktop restart the host resumes the agents in the background.
// This row shows the agents of one project and its children: how many are
// back, and each one that failed with the host's reason. Retry asks the host
// to try the failed agents again. The row is gone once every agent is back.
export function RestartStatus({ project }: { project: Pick<Project, "path"> }) {
	const { orpc, queryClient } = useApp();
	const status = useQuery({
		...orpc.system.restartStatus.queryOptions({ input: {} }),
		refetchInterval: (query) => (query.state.data && query.state.data.finishedAt === null ? 2000 : false),
	}).data;
	const retry = useMutation({
		...orpc.system.resumeRestart.mutationOptions(),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.system.restartStatus.queryKey({ input: {} }) }),
	});
	if (!status) return null;
	const mine = status.sessions.filter(
		(session) => session.projectPath === project.path || session.projectPath?.startsWith(`${project.path}.`),
	);
	const running = status.finishedAt === null;
	const failed = mine.filter((session) => session.state === "failed");
	if (mine.length === 0 || (!running && failed.length === 0 && status.error === null)) return null;
	const back = mine.filter((session) => session.state === "resumed").length;
	const skipped = mine.filter((session) => session.state === "skipped").length;
	const resuming = mine.find((session) => session.state === "resuming");
	return (
		<div role="status" className="flex flex-col gap-1.5 border-b border-edge px-4 py-2">
			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={running ? "wait" : "bad"}>{running ? "Agents resuming" : "Agent resume incomplete"}</Badge>
				<span className="text-sm text-fg">
					{back} of {mine.length} agents back
					{skipped > 0 ? `, ${skipped} stopped before the restart` : ""}
					{failed.length > 0 ? `, ${failed.length} failed` : ""}
					{resuming ? `. Resuming ${resuming.runName ?? resuming.runId}` : ""}
				</span>
				{!running && failed.length > 0 && (
					<Button
						variant="quiet"
						onClick={() => retry.mutate({ restartId: status.restartId })}
						disabled={retry.isPending}
					>
						Retry
					</Button>
				)}
			</div>
			{status.error !== null && <p className="text-sm text-danger">{status.error}</p>}
			{failed.map((session) => (
				<p key={session.runId} className="text-sm text-fg-muted">
					<span className="font-medium text-fg">{session.runName ?? session.runId}</span> {session.error}
				</p>
			))}
		</div>
	);
}
