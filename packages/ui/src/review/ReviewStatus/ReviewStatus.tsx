import { PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

export function ReviewStatus({
	state: value,
	isQueued,
	readyForReview,
}: {
	state: string;
	isQueued: boolean;
	readyForReview: boolean;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const word = isQueued
		? "Queued"
		: state === "MERGED"
			? "Merged"
			: state === "CLOSED"
				? "Closed"
				: readyForReview
					? "Open"
					: "Not ready";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph state={glyphState} isQueued={isQueued} readyForReview={readyForReview} size="sm" decorative />
			<Badge tone={isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
				{word}
			</Badge>
		</span>
	);
}
