import { GitBranch } from "@phosphor-icons/react";
import type { AgentRun, AgentWorkspaceSummary } from "@trellis/api";
import { CodeText, LineChanges, Skeleton } from "@trellis/ui";
import { formatCount } from "../../../../../lib/format";

export type SessionMetaProps = {
	run: Pick<AgentRun, "id" | "projectId">;
	// Undefined while the first read runs.
	summary: AgentWorkspaceSummary | undefined;
};

// A branch that the agent kept as Trellis named it at launch: the run kind
// and the run id. Such a name says nothing that the session name does not.
export const isDefaultBranch = (branch: string, runId: string) => branch.endsWith(`-${runId.toLowerCase()}`);

// The line under the session name. It reads the branch when the agent
// chose one, the line counts, and how far the workspace is behind its base
// branch. A scratch session has one constant branch, so it reads the
// counts alone. The line keeps its 16 px in every state, so the name does
// not move when the counts arrive.
export function SessionMeta({ run, summary }: SessionMetaProps) {
	if (summary === undefined)
		return (
			<p className="flex h-4 items-center text-xs text-fg-faint" aria-live="polite">
				<Skeleton width="w-24" height="h-2.5" />
				<span className="sr-only">Load workspace…</span>
			</p>
		);
	if (summary.state === "missing") return <p className="h-4 truncate text-xs text-fg-faint">Workspace removed</p>;
	if (summary.state === "unreadable")
		return <p className="h-4 truncate text-xs text-fg-faint">Git state unavailable</p>;
	const branch = summary.branch !== null && run.projectId !== null && !isDefaultBranch(summary.branch, run.id);
	const changed = summary.additions > 0 || summary.deletions > 0;
	return (
		<p className="flex h-4 min-w-0 items-center gap-2 text-xs text-fg-muted">
			{branch && (
				<span className="flex min-w-0 items-center gap-1 max-md:hidden">
					<GitBranch aria-hidden="true" className="size-3 shrink-0" />
					<span className="sr-only">Branch </span>
					<CodeText className="truncate">{summary.branch}</CodeText>
				</span>
			)}
			{changed ? <LineChanges value={summary} pending={false} align="start" /> : <span>No changes</span>}
			{summary.base !== null && summary.behind > 0 && (
				<span className="truncate tabular">
					<span aria-hidden="true">· </span>
					{formatCount(summary.behind)} behind {summary.base}
				</span>
			)}
		</p>
	);
}
