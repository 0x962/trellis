import type { PullRequestEvidence } from "@trellis/api";
import { EmptyState, SectionHeader } from "@trellis/ui";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";

export type EvidenceDocumentProps = {
	// `null` until an agent writes the evidence document.
	evidence: PullRequestEvidence | null;
	// Passed to `ReadOnlyMarkdown`; it must sanitize its output.
	render?: (markdown: string) => string;
};

// The evidence document that the agent writes in Markdown to show the change
// working, with screenshots, code blocks and mermaid diagrams.
export function EvidenceDocument({ evidence, render }: EvidenceDocumentProps) {
	return (
		<section aria-label="Evidence" className="flex min-w-0 flex-col gap-2">
			<SectionHeader title="Evidence" />
			{evidence === null ? (
				<EmptyState title="No evidence" />
			) : (
				<ReadOnlyMarkdown markdown={evidence.body} render={render} className="text-base text-fg" />
			)}
		</section>
	);
}
