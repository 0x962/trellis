import { PrGlyph } from "../../domain/PrGlyph";
import { Badge } from "../../primitives/Badge";

export function ReviewStatus({
	state: value,
	isDraft,
	isQueued,
}: {
	state: string;
	isDraft: boolean;
	isQueued: boolean;
}) {
	const state = value.toUpperCase();
	const glyphState = state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
	const draft = state === "DRAFT" || isDraft;
	const word = isQueued
		? "Queued"
		: state === "MERGED"
			? "Merged"
			: state === "CLOSED"
				? "Closed"
				: draft
					? "Draft"
					: "Open";
	return (
		<span className="inline-flex items-center gap-1">
			<PrGlyph state={glyphState} isDraft={draft} isQueued={isQueued} size="sm" decorative />
			<Badge tone={isQueued ? "wait" : state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
				{word}
			</Badge>
		</span>
	);
}
