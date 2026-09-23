import { LineChanges, lineChangesVisible } from "@trellis/ui";
import { useWorkspaceSummary, type WorkspaceSummaryRun } from "../../../../../../agents/useWorkspaceSummary";

// The line counts at the end of a session row. The 64 px column is always
// present, so a title never moves when a count arrives. A row in a collapsed
// group passes enabled false, so useWorkspaceSummary does not call the server.
export function RunLineChanges({ run, enabled }: { run: WorkspaceSummaryRun; enabled: boolean }) {
	const summary = useWorkspaceSummary(run, { enabled }).data;
	if (summary === undefined) return <LineChanges value={null} pending align="end" />;
	if (summary.state === "ready" && lineChangesVisible(summary))
		return <LineChanges value={summary} pending={false} align="end" />;
	return <LineChanges value={null} pending={false} align="end" />;
}
