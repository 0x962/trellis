import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section name="PrGlyph" note="the five GitHub states; the medium size, then the small size">
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={false} isQueued={false} /> Open
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft isQueued={false} /> Draft
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={false} isQueued /> Queued
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" isDraft={false} isQueued={false} /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" isDraft={false} isQueued={false} /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={false} isQueued={false} size="sm" />
				<PrGlyph state="open" isDraft isQueued={false} size="sm" />
				<PrGlyph state="open" isDraft={false} isQueued size="sm" />
				<PrGlyph state="merged" isDraft={false} isQueued={false} size="sm" />
				<PrGlyph state="closed" isDraft={false} isQueued={false} size="sm" />
				In a table row
			</span>
		</Section>
	);
}
