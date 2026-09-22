import { type LocalPrState, PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

// `localState` is the review state that Trellis keeps. An open pull request
// reads Draft while GitHub or the local state says draft.
export function ReviewStatus({
	state: value,
	isDraft,
	isQueued,
	localState,
}: {
	state: string;
	isDraft: boolean;
	isQueued: boolean;
	localState: LocalPrState;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const draft = state === "DRAFT" || isDraft;
	const reviewDraft = draft || localState === "draft";
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
			<PrGlyph state={glyphState} isDraft={draft} isQueued={isQueued} localState={localState} size="sm" decorative />
			<Badge tone={isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
				{word}
			</Badge>
		</span>
	);
}
