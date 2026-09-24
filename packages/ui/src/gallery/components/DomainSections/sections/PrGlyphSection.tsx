import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section
			name="PrGlyph"
			note="the pull request states and the local review flag; the medium size, then the small size"
		>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} askedForReview /> Ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} askedForReview={false} /> Not ready for review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued askedForReview /> Queued
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" isQueued={false} askedForReview /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" isQueued={false} askedForReview /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} askedForReview size="sm" />
				<PrGlyph state="open" isQueued={false} askedForReview={false} size="sm" />
				<PrGlyph state="open" isQueued askedForReview size="sm" />
				<PrGlyph state="merged" isQueued={false} askedForReview size="sm" />
				<PrGlyph state="closed" isQueued={false} askedForReview size="sm" />
				In a table row
			</span>
		</Section>
	);
}
