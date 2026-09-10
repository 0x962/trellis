import { Button, Dialog } from "@trellis/ui";
import type { ReactNode } from "react";

export type ConfirmActionDialogProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	danger?: boolean;
	children?: ReactNode;
	onConfirm: () => void;
	onCancel: () => void;
};

export function ConfirmActionDialog({
	open,
	title,
	description,
	confirmLabel,
	danger = false,
	children,
	onConfirm,
	onCancel,
}: ConfirmActionDialogProps) {
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onCancel()} title={title} description={description}>
			{children}
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel}>Cancel</Button>
				<Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</Dialog>
	);
}
