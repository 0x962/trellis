import { EmptyState } from "../../primitives/EmptyState";

// The three fields an agent writes on a pull request. `headline` states what
// the change does. `why` gives the problem, the approach and the limit.
// `watch` names the first file to open and the reason, or it is "nothing".
// The CLI holds the word limits, so this view prints what it receives.
export type ChangeSummaryFields = {
	headline: string;
	why: string;
	watch: string;
};

export type ChangeSummaryProps = {
	// `null` until an agent writes the three fields.
	summary: ChangeSummaryFields | null;
	// True when the pull request moved to a new head SHA after the agent wrote
	// the summary. The evidence condition counts such a summary as missing.
	behind: boolean;
};

// The agent-written text of a pull request, in three fields. The size and the
// risk of a change are computed conditions, so they belong to ConditionsBlock
// and never to this block.
export function ChangeSummary({ summary, behind }: ChangeSummaryProps) {
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
			{behind && <p className="text-base text-warning">the summary is one revision behind</p>}
		</section>
	);
}
