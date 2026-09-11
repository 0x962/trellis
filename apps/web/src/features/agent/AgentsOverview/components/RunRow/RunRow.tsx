import type { AgentRun } from "@trellis/api";
import { relativeTime } from "../../../../../lib/format";
import { AgentStateBadge } from "../../../AgentStateBadge";

export type RunRowProps = {
	run: AgentRun;
};

// One agent run, with the runner's own error under it. The name leads the
// row: a person calls the agent by it. The row carries the run id as its
// anchor, so a link from a failed agent lands on it.
export function RunRow({ run }: RunRowProps) {
	return (
		<li id={run.id} className="flex flex-col gap-1 border-border border-b px-3 py-2 last:border-b-0">
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				<span className="font-medium text-fg">{run.name}</span>
				<span className="text-fg-muted">{run.ticketIdentifier ?? run.projectPath}</span>
				<span className="text-fg-muted">{`${run.personaName} · ${run.kind}`}</span>
				<AgentStateBadge state={run.state} />
				<span className="font-mono text-fg-faint text-xs">{run.workspaceId ?? "no workspace"}</span>
				<span className="ml-auto text-fg-faint tabular">{`Started ${relativeTime(run.createdAt)}`}</span>
			</div>
			{run.error !== null && <p className="text-danger text-sm">{run.error}</p>}
		</li>
	);
}
