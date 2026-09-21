import { ConfirmDialog, Textarea } from "@trellis/ui";
import { useState } from "react";

// `reviews.submit` refuses a submission whose summary is empty, so the
// dialog asks for the note before the call leaves the page.
const emptyNote = "Enter a note before you send these drafts.";

export type DraftNoteProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	note: string;
	// The message of a failed send, or null. The dialog stays open with the
	// note in the field, so a second click sends the same text again.
	error: string | null;
	processing: boolean;
	onNote: (note: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
};

// The dialog behind `Send back` and `Comment only`: the note that goes to
// GitHub with the drafts, and the message of a failed send.
export function DraftNote({
	open,
	title,
	description,
	confirmLabel,
	note,
	error,
	processing,
	onNote,
	onConfirm,
	onCancel,
}: DraftNoteProps) {
	const [refusal, setRefusal] = useState("");
	return (
		<ConfirmDialog
			open={open}
			title={title}
			description={description}
			confirmLabel={confirmLabel}
			processing={processing}
			onCancel={onCancel}
			onConfirm={() => (note.trim() === "" ? setRefusal(emptyNote) : onConfirm())}
		>
			<div className="review-draft-note">
				<Textarea
					label="Note"
					rows={4}
					value={note}
					invalid={refusal !== ""}
					onChange={(event) => {
						onNote(event.target.value);
						setRefusal("");
					}}
				/>
				{(refusal || error) && (
					<p role="alert" className="review-error">
						{refusal || error}
					</p>
				)}
			</div>
		</ConfirmDialog>
	);
}
