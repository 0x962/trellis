import { Button, Dialog } from "@trellis/ui";

export type ConfirmDialogProps = {
	open: boolean;
	// The question, such as "Delete CDE-42?". It names the dialog.
	title: string;
	description?: string;
	// The label of the confirming button.
	confirmLabel: string;
	// A danger confirm is red: delete, discard.
	danger?: boolean;
	modal?: boolean | "trap-focus";
	onConfirm: () => void;
	onCancel: () => void;
};

// A question with two answers. Escape and the scrim cancel; focus returns
// to the element that opened it.
export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	danger = false,
	modal = true,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<Dialog
			open={open}
			modal={modal}
			onOpenChange={(next) => !next && onCancel()}
			title={title}
			description={description}
		>
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel}>Cancel</Button>
				<Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</Dialog>
	);
}
