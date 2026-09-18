import { LineChanges } from "@trellis/ui";
import { useWorkspaceSummary, type WorkspaceSummaryRun } from "../../../../../../agents/useWorkspaceSummary";

// The line counts at the end of a session row. The 64 px column is always
// present, so a title never moves when a count arrives. The column is
// blank when the workspace has no changes or is gone, and shows dashes
// when Git could not read it. A row in a collapsed group reads nothing.
export function RunLineChanges({ run, enabled }: { run: WorkspaceSummaryRun; enabled: boolean }) {
	const summary = useWorkspaceSummary(run, { enabled }).data;
	if (summary === undefined) return <LineChanges value={null} pending align="end" />;
	if (summary.state === "missing" || (summary.state === "ready" && summary.additions === 0 && summary.deletions === 0))
		return <span aria-hidden="true" className="inline-block min-w-16 shrink-0" />;
	if (summary.state === "unreadable") return <LineChanges value={null} pending={false} align="end" />;
	return <LineChanges value={summary} pending={false} align="end" />;
}
