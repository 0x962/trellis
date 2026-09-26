import type { Label } from "@trellis/api";
import { ConfirmDialog, FormStatus } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelDeleteDialogProps = {
	// The key of the project that owns the label.
	project: string;
	// The label to delete. The dialog stays closed while this is null.
	label: Label | null;
	onDeleted: () => Promise<void>;
	onClose: () => void;
};

const tickets = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

// The confirm step of a label delete. The delete takes the label off every
// ticket that holds it, so the text states how many tickets change.
export function LabelDeleteDialog({ project, label, onDeleted, onClose }: LabelDeleteDialogProps) {
	const { client } = useApp();
	const [message, setMessage] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const count = label?.ticketCount ?? 0;

	const close = () => {
		setMessage(null);
		setDeleting(false);
		onClose();
	};

	const remove = async () => {
		setDeleting(true);
		try {
			await client.labels.delete({ project, label: label!.id });
			await onDeleted();
			close();
		} catch (error) {
			setDeleting(false);
			setMessage(labelWriteMessage(error));
		}
	};

	return (
		<ConfirmDialog
			open={label !== null}
			title={`Delete ${label?.name ?? "label"}?`}
			description={
				count === 0 ? "No ticket uses this label." : `Deletes the label and removes it from ${tickets(count)}.`
			}
			confirmLabel="Delete label"
			danger
			processing={deleting}
			onConfirm={() => void remove()}
			onCancel={close}
		>
			{message !== null && <FormStatus state="error" message={message} />}
		</ConfirmDialog>
	);
}
