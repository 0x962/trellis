import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section
			name="PrGlyph"
			note="the pull request states and the local review flag; the medium size, then the small size"
		>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" askedForReview /> Ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" askedForReview={false} /> Not ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" askedForReview locallyApproved /> Locally approved
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" askedForReview /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" askedForReview /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" askedForReview size="sm" />
				<PrGlyph state="open" askedForReview={false} size="sm" />
				<PrGlyph state="open" askedForReview locallyApproved size="sm" />
				<PrGlyph state="merged" askedForReview size="sm" />
				<PrGlyph state="closed" askedForReview size="sm" />
				In a table row
			</span>
		</Section>
	);
}
