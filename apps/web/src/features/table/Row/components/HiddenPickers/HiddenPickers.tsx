import type { StatusSummary, TicketSummary } from "@trellis/api";
import type { RefObject } from "react";
import { EpicPicker } from "../../../../pickers/EpicPicker";
import { LabelPicker } from "../../../../pickers/LabelPicker";
import { PriorityPicker } from "../../../../pickers/PriorityPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { WavePicker } from "../../../../pickers/WavePicker";
import type { EditField, RowChange } from "../../Row";

export type HiddenPickersProps = {
	ticket: TicketSummary;
	// The visible column ids. A field whose column shows opens its picker from
	// that cell, so this component draws nothing for it.
	columns: readonly string[];
	editing: EditField | null;
	statuses: readonly StatusSummary[];
	// The row element, which takes the focus back when a picker closes.
	finalFocus: RefObject<HTMLElement | null>;
	onEditingChange: (field: EditField) => (open: boolean) => void;
	onChange: (change: RowChange) => void;
};

// The empty button a picker opens from when the row has no cell for it. It
// sits in the middle of the row and stays outside the tab order.
const anchor = (label: string) => (
	<button type="button" tabIndex={-1} aria-label={label} className="absolute top-1/2 left-1/2" />
);

// The pickers a key opens for a field whose column the table hides. The
// parent field and the epic field have no editable cell, so their pickers
// always live here. The epic cell of a row is a link to the epic page, and
// the epic list belongs to the project of the ticket. The wave field lists
// the waves of the epic of the ticket, so a ticket outside every epic opens
// no wave picker.
export function HiddenPickers({
	ticket,
	columns,
	editing,
	statuses,
	finalFocus,
	onEditingChange,
	onChange,
}: HiddenPickersProps) {
	return (
		<>
			{editing === "status" && !columns.includes("status") && (
				<StatusPicker
					statuses={statuses}
					value={ticket.status.id}
					open
					onOpenChange={onEditingChange("status")}
					onPick={(status) => onChange({ status })}
					finalFocus={finalFocus}
					trigger={anchor("Status")}
				/>
			)}
			{editing === "priority" && !columns.includes("priority") && (
				<PriorityPicker
					value={ticket.priority}
					open
					onOpenChange={onEditingChange("priority")}
					onPick={(priority) => onChange({ priority })}
					finalFocus={finalFocus}
					trigger={anchor("Priority")}
				/>
			)}
			{editing === "labels" && !columns.includes("labels") && (
				<LabelPicker
					project={ticket.project.key}
					checked={ticket.labels.map((label) => label.id)}
					open
					onOpenChange={onEditingChange("labels")}
					onToggle={(label, checked) => onChange({ label, checked })}
					finalFocus={finalFocus}
					trigger={anchor("Labels")}
				/>
			)}
			{editing === "epic" && (
				<EpicPicker
					project={ticket.project.key}
					value={ticket.epic?.ref}
					open
					onOpenChange={onEditingChange("epic")}
					onPick={(epic) => onChange({ epic })}
					finalFocus={finalFocus}
					trigger={anchor("Epic")}
				/>
			)}
			{editing === "wave" && ticket.epic !== null && (
				<WavePicker
					epic={ticket.epic.ref}
					value={ticket.wave?.ref}
					open
					onOpenChange={onEditingChange("wave")}
					onPick={(wave) => onChange({ wave })}
					finalFocus={finalFocus}
					trigger={anchor("Wave")}
				/>
			)}
			{editing === "parent" && (
				<TicketPicker
					project={ticket.project.key}
					value={ticket.parent?.identifier}
					exclude={[ticket.identifier]}
					open
					onOpenChange={onEditingChange("parent")}
					onPick={(parent) => onChange({ parent })}
					finalFocus={finalFocus}
					trigger={anchor("Parent")}
				/>
			)}
		</>
	);
}
