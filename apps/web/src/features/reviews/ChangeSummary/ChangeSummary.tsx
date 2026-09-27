import type { PullRequestSummary } from "@trellis/api";
import { ChangeSummary as ChangeSummaryView } from "@trellis/ui/review";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";

export type ChangeSummaryProps = {
	// `null` until an agent writes the summary.
	summary: PullRequestSummary | null;
	// Passed to `ReadOnlyMarkdown`; it must sanitize its output.
	render?: (markdown: string) => string;
};

// The agent writes the explanation in Markdown, with screenshots, mermaid
// diagrams and mermaid charts.
export function ChangeSummary({ summary, render }: ChangeSummaryProps) {
	if (summary === null) return <ChangeSummaryView summary={null} />;

	return (
		<ChangeSummaryView
			summary={{ headline: summary.headline, why: <ReadOnlyMarkdown markdown={summary.why} render={render} /> }}
		/>
	);
}
