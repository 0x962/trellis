import { PrGlyph } from "../../../../domain/PrGlyph";
import { Section } from "../../Section";

export function PrGlyphSection() {
	return (
		<Section name="PrGlyph" note="the pull request states and the local draft; the medium size, then the small size">
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} localState="ready" /> Open
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} localState="draft" /> Draft
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued localState="ready" /> Queued
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="merged" isQueued={false} localState="ready" /> Merged
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="closed" isQueued={false} localState="ready" /> Closed
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<PrGlyph state="open" isQueued={false} localState="ready" size="sm" />
				<PrGlyph state="open" isQueued={false} localState="draft" size="sm" />
				<PrGlyph state="open" isQueued localState="ready" size="sm" />
				<PrGlyph state="merged" isQueued={false} localState="ready" size="sm" />
				<PrGlyph state="closed" isQueued={false} localState="ready" size="sm" />
				In a table row
			</span>
		</Section>
	);
}
