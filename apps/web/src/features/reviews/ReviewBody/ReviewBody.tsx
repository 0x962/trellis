import { splitSuggestionBody, suggestionDiff } from "@trellis/api";
import { ReviewSuggestion, type ReviewSuggestionState } from "@trellis/ui/review";
import type { ReactNode } from "react";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";

type Props = {
	body: string;
	// The text the anchor lines hold, or null when nothing recorded it.
	original: string[] | null;
	// The state of the first block. Later blocks render with no controls.
	state: ReviewSuggestionState;
	note?: ReactNode;
	actions?: ReactNode;
};

// A comment body with each suggestion block drawn as a widget and the
// prose around it as markdown.
export function ReviewBody({ body, original, state, note, actions }: Props) {
	const segments = splitSuggestionBody(body);
	if (!segments.some((segment) => segment.kind === "suggestion")) return <ReviewMarkdown body={body} />;
	let blocks = 0;
	return (
		<div className="review-body">
			{segments.map((segment, index) => {
				// A segment has no identity beyond its place in the body.
				const key = index;
				if (segment.kind === "markdown")
					return segment.text.trim() === "" ? null : <ReviewMarkdown key={key} body={segment.text} />;
				const first = blocks === 0;
				blocks += 1;
				return (
					<ReviewSuggestion
						key={key}
						lines={suggestionDiff(original ?? [], segment.lines)}
						state={first ? state : "unknown"}
						note={first ? note : "Only the first suggestion of a comment applies."}
						actions={first ? actions : undefined}
					/>
				);
			})}
		</div>
	);
}
