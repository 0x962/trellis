import type { ReactNode } from "react";
import { Button } from "../Button";
import { Dialog } from "../Dialog";

export type ConfirmDialogProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	// True draws the confirm button in the danger colour. Set it when the
	// action destroys something or stops work that is running.
	danger?: boolean;
	// True while the confirmed action still runs. The confirm button turns
	// its ring and takes no second click, and the dialog stays open until
	// the caller closes it.
	processing?: boolean;
	// False lets the page behind the scrim keep its focus and its scroll. Set
	// it when this dialog opens on top of another dialog, because two focus
	// traps on one screen take the keyboard from each other.
	modal?: boolean | "trap-focus";
	children?: ReactNode;
	onConfirm: () => void;
	onCancel: () => void;
};

// The one modal that asks a person to confirm an action. The scrim blocks
// the page behind it, Escape cancels, and focus returns to the control that
// opened it.
export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	danger = false,
	processing = false,
	modal = true,
	children,
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
			{children}
			<div className="flex justify-end gap-2">
				<Button disabled={processing} onClick={onCancel}>
					Cancel
				</Button>
				<Button variant={danger ? "danger" : "primary"} processing={processing} onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</Dialog>
	);
}
