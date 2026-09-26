import { ConfirmDialog, Textarea } from "@trellis/ui";
import { useState } from "react";

// The Request changes and Comment verdicts need a note. Approve can use an
// empty note.
const emptyNote = "Enter a note before you send these comments.";

export type DraftNoteProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	note: string;
	noteRequired: boolean;
	// The message of a failed send, or null. The dialog stays open with the
	// note in the field, so a second click sends the same text again.
	error: string | null;
	processing: boolean;
	onNote: (note: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
};

// The dialog for a local verdict note and the message of a failed submit.
export function DraftNote({
	open,
	title,
	description,
	confirmLabel,
	note,
	noteRequired,
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
			onConfirm={() => (noteRequired && note.trim() === "" ? setRefusal(emptyNote) : onConfirm())}
		>
			<div className="review-draft-note">
				<Textarea
					label="Note"
					rows={4}
					value={note}
					error={refusal || undefined}
					onChange={(event) => {
						onNote(event.target.value);
						setRefusal("");
					}}
				/>
				{!refusal && error && (
					<p role="alert" className="review-error">
						{error}
					</p>
				)}
			</div>
		</ConfirmDialog>
	);
}
