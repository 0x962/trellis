import type { PullRequestSummary } from "@trellis/api";
import { ChangeSummary as ChangeSummaryView } from "@trellis/ui/review";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";

export type ChangeSummaryProps = {
	// `null` until an agent writes the summary.
	summary: PullRequestSummary | null;
	// The full head SHA of the pull request now. The server takes the stored
	// `summary.headSha` from the GitHub head, so a short SHA never equals it
	// and every summary then reads as one revision behind.
	headSha: string;
	// Passed to `ReadOnlyMarkdown`; it must sanitize its output.
	render?: (markdown: string) => string;
};

// The agent writes the explanation in Markdown, with screenshots, mermaid
// diagrams and mermaid charts.
export function ChangeSummary({ summary, headSha, render }: ChangeSummaryProps) {
	if (summary === null) return <ChangeSummaryView summary={null} headShaMoved={false} />;

	return (
		<ChangeSummaryView
			summary={{ headline: summary.headline, why: <ReadOnlyMarkdown markdown={summary.why} render={render} /> }}
			headShaMoved={summary.headSha !== headSha}
		/>
	);
}
