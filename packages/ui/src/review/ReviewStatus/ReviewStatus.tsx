import { PrGlyph, prGlyphLabel } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

export function ReviewStatus({
	state: value,
	isQueued,
	askedForReview,
	locallyApproved,
	word,
}: {
	state: string;
	isQueued: boolean;
	askedForReview: boolean;
	locallyApproved: boolean;
	word: string;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const tone = isQueued
		? "wait"
		: state === "MERGED"
			? "agent"
			: state === "OPEN" && askedForReview && locallyApproved
				? "ok"
				: "neutral";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph
				state={glyphState}
				askedForReview={askedForReview}
				locallyApproved={locallyApproved}
				size="sm"
				decorative
			/>
			<Badge tone={tone} size="sm">
				{glyphState === "open" ? prGlyphLabel(glyphState, askedForReview, locallyApproved) : word}
			</Badge>
		</span>
	);
}
