import { type LocalPrState, PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

export function ReviewStatus({
	state: value,
	isQueued,
	localState,
}: {
	state: string;
	isQueued: boolean;
	localState: LocalPrState;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const reviewDraft = localState === "draft";
	const word = isQueued
		? "Queued"
		: state === "MERGED"
			? "Merged"
			: state === "CLOSED"
				? "Closed"
				: reviewDraft
					? "Draft"
					: "Open";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph state={glyphState} isQueued={isQueued} localState={localState} size="sm" decorative />
			<Badge tone={isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
				{word}
			</Badge>
		</span>
	);
}
