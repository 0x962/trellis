import { PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

// The state of a pull request as one glyph and one word. `askedForReview` is
// the local review flag of the pull request, and it draws the glyph and the
// tone of the badge. `word` is the text of the badge, which the caller
// writes, such as `Not ready` or `Merged`.
export function ReviewStatus({
	state: value,
	isQueued,
	askedForReview,
	word,
}: {
	state: string;
	isQueued: boolean;
	askedForReview: boolean;
	word: string;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	// The badge takes the green tone on the same condition as the open glyph:
	// the pull request is open and the agent asked for review.
	const tone = isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" && askedForReview ? "ok" : "neutral";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph state={glyphState} isQueued={isQueued} askedForReview={askedForReview} size="sm" decorative />
			<Badge tone={tone} size="sm">
				{word}
			</Badge>
		</span>
	);
}
