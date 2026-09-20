import { EmptyState } from "../../primitives/EmptyState";

export type ChangeSummaryFields = {
	headline: string;
	why: string;
	watch: string;
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
			<section aria-label="Change summary" className="flex min-w-0 flex-col">
				<EmptyState description="The agent has not written the summary." />
			</section>
		);
	}

	return (
		<section aria-label="Change summary" className="flex min-w-0 flex-col gap-2">
			<p className="text-md font-medium text-fg">{summary.headline}</p>
			<p className="text-base text-fg">{summary.why}</p>
			<p className="text-base text-fg">
				<span className="text-fg-muted">{"Watch this: "}</span>
				{summary.watch}
			</p>
			{headShaMoved && <p className="text-base text-warning">The summary is one revision behind.</p>}
		</section>
	);
}
