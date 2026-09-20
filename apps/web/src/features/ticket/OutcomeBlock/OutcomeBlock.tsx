import { EmptyState, SectionHeader } from "@trellis/ui";

export type OutcomeBlockProps = {
	// The one sentence `trellis outcome set` writes when a pull request of the
	// ticket merges. It is empty before that.
	outcome: string;
};

// What merged, in the sentence the brief of the next ticket reads.
export function OutcomeBlock({ outcome }: OutcomeBlockProps) {
	return (
		<section aria-label="The outcome" className="flex min-w-0 flex-col">
			<SectionHeader title="THE OUTCOME" />
			{outcome === "" ? (
				<EmptyState description="Empty until a pull request merges." />
			) : (
				<p className="text-sm text-fg">{outcome}</p>
			)}
		</section>
	);
}
