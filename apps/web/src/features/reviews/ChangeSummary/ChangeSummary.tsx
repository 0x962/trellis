import type { PullRequestSummary } from "@trellis/api";
import { ChangeSummary as ChangeSummaryView } from "@trellis/ui/review";

export type ChangeSummaryProps = {
	// `null` until an agent writes the summary.
	summary: PullRequestSummary | null;
	// The full head SHA of the pull request now. The server takes the stored
	// `summary.headSha` from the GitHub head, so a short SHA never equals it
	// and every summary then reads as one revision behind.
	headSha: string;
};

export function ChangeSummary({ summary, headSha }: ChangeSummaryProps) {
	if (summary === null) return <ChangeSummaryView summary={null} headShaMoved={false} />;

	return (
		<ChangeSummaryView
			summary={{ headline: summary.headline, why: summary.why }}
			headShaMoved={summary.headSha !== headSha}
		/>
	);
}
