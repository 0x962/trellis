import { PencilSimple, Trash } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { type DraftFinding, ReviewComposer } from "../ReviewComposer/ReviewComposer";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";

export function ReviewDraft({
	draft,
	storageKey,
	onSave,
	onDiscard,
}: {
	draft: DraftFinding;
	storageKey: string;
	onSave: (draft: DraftFinding) => void;
	onDiscard: () => void;
}) {
	const [editing, setEditing] = useState(false);
	if (editing)
		return (
			<ReviewComposer
				anchor={draft}
				draft={draft}
				revisionId={draft.revisionId}
				storageKey={storageKey}
				onSave={onSave}
				onClose={() => setEditing(false)}
			/>
		);
	return (
		<article className="review-thread" aria-label="Draft comment">
			<div className="review-message">
				<header>
					<strong>Pending review</strong>
					<span className="review-meta">
						{draft.startLine === draft.line ? `Line ${draft.line}` : `Lines ${draft.startLine}–${draft.line}`}
					</span>
					<Tooltip content="Edit draft">
						<IconButton label="Edit draft" icon={<PencilSimple />} onClick={() => setEditing(true)} />
					</Tooltip>
					<Tooltip content="Discard draft">
						<IconButton
							label="Discard draft"
							icon={<Trash />}
							onClick={() => {
								localStorage.removeItem(storageKey);
								onDiscard();
							}}
						/>
					</Tooltip>
				</header>
				<ReviewMarkdown body={draft.body} />
			</div>
		</article>
	);
}
