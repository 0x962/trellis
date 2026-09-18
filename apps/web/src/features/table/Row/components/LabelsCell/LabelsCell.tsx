import type { Label, TicketLabel } from "@trellis/api";
import { LabelPills } from "@trellis/ui";
import type { RefObject } from "react";
import { LabelPicker } from "../../../../pickers/LabelPicker";
import { cellButtonClass } from "../../cellButtonClass";

export type LabelsCellProps = {
	labels: readonly TicketLabel[];
	// The path of the project that holds the ticket. The picker reads the
	// labels of that project tree.
	project: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onToggle: (label: Label, checked: boolean) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

const nameOf = (label: TicketLabel) => (label.group === null ? label.name : `${label.group} / ${label.name}`);

// The labels of a ticket, which open the label picker on click or on `l`. A
// ticket with no label draws an empty button that still fills the cell, so
// every row of the column has the same hit area.
export function LabelsCell({ labels, project, open, onOpenChange, onToggle, finalFocus }: LabelsCellProps) {
	const names = labels.map(nameOf).join(", ");
	return (
		<LabelPicker
			project={project}
			checked={labels.map((label) => label.id)}
			onToggle={onToggle}
			open={open}
			onOpenChange={onOpenChange}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label={`Labels: ${names === "" ? "none" : names}`} className={cellButtonClass}>
					<LabelPills labels={labels} max={2} />
				</button>
			}
		/>
	);
}
