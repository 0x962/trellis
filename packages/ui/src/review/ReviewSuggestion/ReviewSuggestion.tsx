import type { ReactNode } from "react";

// One line of the mini diff. `marks` are the character ranges a replaced
// line does not share with its counterpart.
export type ReviewSuggestionLine = {
	type: "context" | "deletion" | "addition";
	text: string;
	marks?: [number, number][];
};

// `open` can be applied. `preview` is the composer's own view. `invalid`
// equals the current lines. `unknown` has no original lines to compare.
export type ReviewSuggestionState = "open" | "applied" | "outdated" | "preview" | "invalid" | "unknown";

type Props = {
	lines: ReviewSuggestionLine[];
	state: ReviewSuggestionState;
	// The words in the footer: the applied commit, or why apply is off.
	note?: ReactNode;
	// The apply controls, drawn at the end of the footer.
	actions?: ReactNode;
};

const labels: Record<ReviewSuggestionState, string | null> = {
	open: null,
	applied: "Applied",
	outdated: "Outdated",
	preview: "Preview",
	invalid: "No change",
	unknown: null,
};

const markers: Record<ReviewSuggestionLine["type"], string> = { context: " ", deletion: "-", addition: "+" };

const markedText = (text: string, marks: [number, number][] | undefined): ReactNode => {
	if (marks === undefined || marks.length === 0) return text;
	const parts: ReactNode[] = [];
	let at = 0;
	for (const [start, end] of marks) {
		if (start > at) parts.push(text.slice(at, start));
		parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
		at = end;
	}
	if (at < text.length) parts.push(text.slice(at));
	return parts;
};

// The widget a review comment draws for a suggestion block: the original
// lines as deletions, the suggested lines as additions, and the apply
// controls. The block in the comment body stays the source of truth.
export function ReviewSuggestion({ lines, state, note, actions }: Props) {
	const label = labels[state];
	return (
		<div className="review-suggestion" data-state={state}>
			<div className="review-suggestion-header">
				<span>Suggested change</span>
				{label !== null && <span className="review-suggestion-state">{label}</span>}
			</div>
			<div className="review-suggestion-diff">
				{lines.length === 0 ? (
					<div className="review-suggestion-line" data-type="context">
						<span className="review-suggestion-marker" aria-hidden="true">
							{" "}
						</span>
						<code> </code>
					</div>
				) : (
					lines.map((line, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the diff lines are a fixed list with no identity.
						<div className="review-suggestion-line" data-type={line.type} key={index}>
							<span className="review-suggestion-marker" aria-hidden="true">
								{markers[line.type]}
							</span>
							<code>{line.text === "" ? " " : markedText(line.text, line.marks)}</code>
						</div>
					))
				)}
			</div>
			{(note !== undefined || actions !== undefined) && (
				<div className="review-suggestion-footer">
					<span className="review-suggestion-note">{note}</span>
					{actions}
				</div>
			)}
		</div>
	);
}
