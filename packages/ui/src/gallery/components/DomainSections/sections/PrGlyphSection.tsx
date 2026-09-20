import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section name="PrGlyph" note="the four GitHub states; the medium size, then the small size">
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={false} /> Open
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={true} /> Draft
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" isDraft={false} /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" isDraft={false} /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isDraft={false} size="sm" />
				<PrGlyph state="open" isDraft={true} size="sm" />
				<PrGlyph state="merged" isDraft={false} size="sm" />
				<PrGlyph state="closed" isDraft={false} size="sm" />
				In a table row
			</span>
		</Section>
	);
}
