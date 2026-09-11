import type { AgentBatchRecord } from "@trellis/api";
import { compactRelativeTime } from "../../../../../lib/format";

export type AgentBatchesProps = {
	batches: AgentBatchRecord[];
	// The key of each project, by project id.
	keys: Map<string, string>;
};

// The pointers the dispatcher typed into the managers, newest first. The
// server keeps them in memory, so a restart empties the list.
//
// The dispatcher watches a project whose manager trellis itself runs. A
// project with a manager persona is unwatched (apps/server/src/agents/
// host.ts), so its agent runs send no batch. The empty state says so.
export function AgentBatches({ batches, keys }: AgentBatchesProps) {
	if (batches.length === 0) {
		return (
			<div className="flex flex-col gap-1 px-3 py-2 text-fg-faint text-sm">
				<p>No batches since the server started.</p>
				<p>
					The dispatcher wakes a manager that trellis itself runs. A project with a manager persona sends no batch, and
					the server drops the list on a restart.
				</p>
			</div>
		);
	}
	return (
		<ul aria-label="Batches" className="flex flex-col">
			{batches.map((batch) => (
				<li key={`${batch.at}-${batch.projectId}`} className="flex items-center gap-2 px-3 py-1 text-fg-muted text-sm">
					<span className="font-mono text-fg text-xs">{keys.get(batch.projectId)}</span>
					<span className="shrink-0 tabular">{batch.count} changes</span>
					<span className="min-w-0 truncate">{batch.text}</span>
					<time dateTime={batch.at} className="ml-auto shrink-0 text-fg-faint tabular">
						{compactRelativeTime(batch.at)}
					</time>
				</li>
			))}
		</ul>
	);
}
