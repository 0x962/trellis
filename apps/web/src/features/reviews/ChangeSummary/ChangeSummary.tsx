import type { PullRequestSummary } from "@trellis/api";
import { ChangeSummary as ChangeSummaryView } from "@trellis/ui/review";

export type ChangeSummaryProps = {
	// `null` until an agent runs `trellis summary write` on this pull request.
	summary: PullRequestSummary | null;
	// The head SHA of the pull request now. An agent writes a summary for one
	// head SHA, so a later push leaves that summary behind.
	headSha: string;
};

export function ChangeSummary({ summary, headSha }: ChangeSummaryProps) {
	if (summary === null) return <ChangeSummaryView summary={null} behind={false} />;

	return (
		<ChangeSummaryView
			summary={{ headline: summary.headline, why: summary.why, watch: summary.watch }}
			behind={summary.headSha !== headSha}
		/>
	);
}
