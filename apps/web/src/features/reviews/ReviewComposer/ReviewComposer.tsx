import { parseSuggestions, suggestionBlock } from "@trellis/api";
import { type DiffAnchor, ReviewCommentEditor, type ReviewSuggestionState } from "@trellis/ui/review";
import { useState } from "react";
import { ReviewBody } from "../ReviewBody";

export type ReviewCommentInput = DiffAnchor & { body: string; revisionId: string | null; original?: string[] };

const sameLines = (left: string[], right: string[]) =>
	left.length === right.length && left.every((line, index) => line === right[index]);

const unchanged = "Change the lines inside the suggestion block. It equals the current lines.";

export function ReviewComposer({
	anchor,
	lines,
	revisionId,
	storageKey,
	onSave,
	onClose,
	pending,
	error,
}: {
	anchor: DiffAnchor;
	// The text of the anchor lines, or null when the view does not show
	// every line of the range.
	lines: string[] | null;
	revisionId: string | null;
	storageKey: string;
	onSave: (comment: ReviewCommentInput) => void;
	onClose: () => void;
	pending: boolean;
	error: string | null;
}) {
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	const [invalid, setInvalid] = useState<string | null>(null);
	// The first block equals the current lines, so an apply would change
	// nothing. GitHub refuses the same block.
	const noChange = (text: string) => {
		const first = parseSuggestions(text)[0];
		return first !== undefined && lines !== null && sameLines(first.lines, lines);
	};
	const previewState = (text: string): ReviewSuggestionState =>
		noChange(text) ? "invalid" : lines === null ? "unknown" : "preview";
	return (
		<ReviewCommentEditor
			body={body}
			location={anchor.startLine === anchor.line ? `Line ${anchor.line}` : `Lines ${anchor.startLine}–${anchor.line}`}
			saveLabel="Add comment"
			pending={pending}
			error={invalid ?? error}
			suggestionText={lines === null ? null : suggestionBlock(lines)}
			suggestionUnavailable="Show the full file to suggest a change on these lines"
			renderPreview={(text) => (
				<ReviewBody
					body={text}
					original={lines}
					state={previewState(text)}
					note={
						noChange(text)
							? unchanged
							: lines === null
								? "The original lines are unknown, so this suggestion cannot be applied."
								: undefined
					}
				/>
			)}
			onChange={(text) => {
				setBody(text);
				setInvalid(null);
				localStorage.setItem(storageKey, text);
			}}
			onCancel={onClose}
			onSave={() => {
				if (noChange(body)) {
					setInvalid(unchanged);
					return;
				}
				onSave({ ...anchor, body, revisionId, ...(lines === null ? {} : { original: lines }) });
			}}
		/>
	);
}
