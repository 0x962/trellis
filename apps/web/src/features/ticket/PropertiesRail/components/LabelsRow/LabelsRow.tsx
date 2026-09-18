import type { Label, Ticket } from "@trellis/api";
import { Button, LabelPills, PropertyRow } from "@trellis/ui";
import { failToast } from "../../../../../lib/failToast";
import { useLabels } from "../../../../pickers/hooks/useLabels";
import { LabelPicker } from "../../../../pickers/LabelPicker";
import { toggleLabel } from "../../../../pickers/utils/toggleLabel";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { usePickerStore } from "../../../stores/pickerStore";

export type LabelsRowProps = {
	ticket: Ticket;
};

// The rail trigger draws every label of the ticket, so it holds as many
// lines as the pills need. `h-auto` and `whitespace-normal` undo the one
// line of a Button; `min-h-7` keeps the 28 px hit area of a short row.
const triggerClass = "-ml-2 h-auto max-w-full min-h-7 justify-start py-1 font-normal whitespace-normal";

// The labels of the ticket, and the picker that changes them. One picked
// row is one write: an add, or a remove. The write carries no
// `expectedVersion`, because an add and a remove of two different labels
// never contradict each other, and two quick picks would otherwise refuse
// the second one. A failure puts the labels the ticket had back and shows a
// toast with a Retry action.
export function LabelsRow({ ticket }: LabelsRowProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const { groups } = useLabels(ticket.project.path);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);

	const toggle = async (label: Label, checked: boolean) => {
		const delta = checked ? { addLabels: [label.id] } : { removeLabels: [label.id] };
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, ...delta }), {
				optimistic: (row) => ({ ...row, labels: toggleLabel(row.labels, label, groups, checked) }),
			});
		} catch (error) {
			failToast(`The labels of ${ticket.identifier} did not change.`, error, () => void toggle(label, checked));
		}
	};

	return (
		<PropertyRow compact align="start" label="Labels">
			<LabelPicker
				project={ticket.project.path}
				checked={ticket.labels.map((label) => label.id)}
				onToggle={(label, checked) => void toggle(label, checked)}
				trigger={
					<Button variant="quiet" className={triggerClass}>
						{ticket.labels.length === 0 ? (
							<span className="text-fg-muted">Add label</span>
						) : (
							<LabelPills wrap labels={ticket.labels} />
						)}
					</Button>
				}
				open={open === "labels"}
				onOpenChange={(next) => setOpen(next ? "labels" : null)}
			/>
		</PropertyRow>
	);
}
