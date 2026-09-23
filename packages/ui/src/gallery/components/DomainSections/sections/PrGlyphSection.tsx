import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section
			name="PrGlyph"
			note="the pull request states and the review readiness; the medium size, then the small size"
		>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} readyForReview /> Ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} readyForReview={false} reason="2 checks pending" /> Not ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued readyForReview /> Queued
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" isQueued={false} readyForReview /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" isQueued={false} readyForReview /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} readyForReview size="sm" />
				<PrGlyph state="open" isQueued={false} readyForReview={false} reason="no evidence document" size="sm" />
				<PrGlyph state="open" isQueued readyForReview size="sm" />
				<PrGlyph state="merged" isQueued={false} readyForReview size="sm" />
				<PrGlyph state="closed" isQueued={false} readyForReview size="sm" />
				In a table row
			</span>
		</Section>
	);
}
