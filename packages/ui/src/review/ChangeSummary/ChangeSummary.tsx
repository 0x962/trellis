import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";

export type ChangeSummaryFields = {
	headline: string;
	// The explanation, as text or as the rendered Markdown with its images
	// and diagrams.
	why: ReactNode;
};

export type ChangeSummaryProps = {
	// `null` until an agent writes the summary.
	summary: ChangeSummaryFields | null;
	// True when the pull request moved to a new head SHA after the agent wrote
	// the summary.
	headShaMoved: boolean;
};

export function ChangeSummary({ summary, headShaMoved }: ChangeSummaryProps) {
	if (summary === null) {
		return (
			<section aria-label="Change summary" className="flex min-w-0 flex-col gap-2">
				<SectionHeader title="Summary" />
				<EmptyState description="The agent has not written a summary yet." />
			</section>
		);
	}

	return (
		<section aria-label="Change summary" className="flex min-w-0 flex-col gap-2">
			<SectionHeader title="Summary" />
			<p className="text-lg font-medium text-fg">{summary.headline}</p>
			<div className="text-base text-fg">{summary.why}</div>
			{headShaMoved && <p className="text-base text-warning">The summary is one revision behind.</p>}
		</section>
	);
}
