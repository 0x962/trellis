import type { Label, LabelGroup } from "@trellis/api";
import { ChoiceGroup, type ChoiceGroupOption, ConfirmDialog, FormStatus } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelGroupDeleteDialogProps = {
	// The key of the project that owns the group.
	project: string;
	// The group to delete. The dialog stays closed while this is null.
	group: LabelGroup | null;
	// The labels the group holds.
	labels: readonly Label[];
	onDeleted: () => Promise<void>;
	onClose: () => void;
};

// What happens to the labels of the group: they stay as labels with no
// group, or they go with the group.
type LabelsChoice = "ungroup" | "delete";

const count = (amount: number, one: string, many: string) => `${formatCount(amount)} ${amount === 1 ? one : many}`;

// The confirm step of a group delete. A group holds labels that tickets hold,
// so the person chooses what happens to those labels first.
export function LabelGroupDeleteDialog({ project, group, labels, onDeleted, onClose }: LabelGroupDeleteDialogProps) {
	const { client } = useApp();
	const [choice, setChoice] = useState<LabelsChoice>("ungroup");
	const [message, setMessage] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const labelCount = labels.length;
	const ticketCount = labels.reduce((total, label) => total + label.ticketCount, 0);

	const close = () => {
		setChoice("ungroup");
		setMessage(null);
		setDeleting(false);
		onClose();
	};

	const remove = async () => {
		setDeleting(true);
		try {
			await client.labelGroups.delete({ project, group: group!.id, labels: choice });
			await onDeleted();
			close();
		} catch (error) {
			setDeleting(false);
			setMessage(labelWriteMessage(error));
		}
	};

	const options: ChoiceGroupOption<LabelsChoice>[] = [
		{
			value: "ungroup",
			label: "Keep the labels without a group",
			description: `Keeps ${count(labelCount, "label", "labels")} on their tickets, with no group.`,
		},
		{
			value: "delete",
			label: "Delete the labels too",
			description:
				ticketCount === 0
					? `Deletes ${count(labelCount, "label", "labels")}. No ticket holds them.`
					: `Deletes ${count(labelCount, "label", "labels")} and removes them from ${count(ticketCount, "ticket", "tickets")}.`,
		},
	];

	return (
		<ConfirmDialog
			open={group !== null}
			title={`Delete ${group?.name ?? "group"}?`}
			description={
				labelCount === 0 ? "The group holds no label." : `The group holds ${count(labelCount, "label", "labels")}.`
			}
			confirmLabel="Delete group"
			danger
			processing={deleting}
			onConfirm={() => void remove()}
			onCancel={close}
		>
			{labelCount > 0 && (
				<ChoiceGroup label="What happens to the labels" options={options} value={choice} onValueChange={setChoice} />
			)}
			{message !== null && <FormStatus state="error" message={message} />}
		</ConfirmDialog>
	);
}
