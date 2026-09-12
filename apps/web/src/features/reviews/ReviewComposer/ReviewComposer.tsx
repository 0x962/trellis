import { type DiffAnchor, ReviewCommentEditor } from "@trellis/ui/review";
import { useState } from "react";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";
export type DraftFinding = DiffAnchor & { id: string; body: string; revisionId: string | null };
export function ReviewComposer({
	anchor,
	revisionId,
	storageKey,
	draft,
	onSave,
	onClose,
}: {
	anchor: DiffAnchor;
	revisionId: string | null;
	storageKey: string;
	draft?: DraftFinding;
	onSave: (draft: DraftFinding) => void;
	onClose: () => void;
}) {
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? draft?.body ?? "");
	return (
		<ReviewCommentEditor
			body={body}
			location={anchor.startLine === anchor.line ? `Line ${anchor.line}` : `Lines ${anchor.startLine}–${anchor.line}`}
			saveLabel={draft ? "Save comment" : "Add to review"}
			renderPreview={(text) => <ReviewMarkdown body={text} />}
			onChange={(text) => {
				setBody(text);
				localStorage.setItem(storageKey, text);
			}}
			onCancel={onClose}
			onSave={() => {
				onSave({ ...anchor, body, id: draft?.id ?? crypto.randomUUID(), revisionId });
				localStorage.removeItem(storageKey);
				onClose();
			}}
		/>
	);
}
