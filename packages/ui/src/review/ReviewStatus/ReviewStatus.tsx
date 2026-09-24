import { PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

// The state of a pull request as one glyph and one word. `askedForReview`
// is the local review flag of the pull request, so `Not ready` says that the
// agent has not handed the pull request over. The check counts sit in their
// own cell of the row.
export function ReviewStatus({
	state: value,
	isQueued,
	askedForReview,
}: {
	state: string;
	isQueued: boolean;
	askedForReview: boolean;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const word = isQueued
		? "Queued"
		: state === "MERGED"
			? "Merged"
			: state === "CLOSED"
				? "Closed"
				: askedForReview
					? "Open"
					: "Not ready";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph state={glyphState} isQueued={isQueued} askedForReview={askedForReview} size="sm" decorative />
			<Badge tone={isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
				{word}
			</Badge>
		</span>
	);
}
