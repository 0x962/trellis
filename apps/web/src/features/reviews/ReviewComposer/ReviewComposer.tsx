import { type DiffAnchor, ReviewCommentEditor } from "@trellis/ui/review";
import { useState } from "react";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";
export type ReviewCommentInput = DiffAnchor & { body: string; revisionId: string | null };
export function ReviewComposer({
	anchor,
	revisionId,
	storageKey,
	onSave,
	onClose,
	pending,
	error,
}: {
	anchor: DiffAnchor;
	revisionId: string | null;
	storageKey: string;
	onSave: (comment: ReviewCommentInput) => void;
	onClose: () => void;
	pending: boolean;
	error: string | null;
}) {
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	return (
		<ReviewCommentEditor
			body={body}
			location={anchor.startLine === anchor.line ? `Line ${anchor.line}` : `Lines ${anchor.startLine}–${anchor.line}`}
			saveLabel="Add comment"
			pending={pending}
			error={error}
			renderPreview={(text) => <ReviewMarkdown body={text} />}
			onChange={(text) => {
				setBody(text);
				localStorage.setItem(storageKey, text);
			}}
			onCancel={onClose}
			onSave={() => {
				onSave({ ...anchor, body, revisionId });
			}}
		/>
	);
}
