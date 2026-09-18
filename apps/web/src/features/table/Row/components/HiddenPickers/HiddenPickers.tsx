import type { ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import type { RefObject } from "react";
import { LabelPicker } from "../../../../pickers/LabelPicker";
import { PriorityPicker } from "../../../../pickers/PriorityPicker";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import type { EditField, RowChange } from "../../Row";

export type HiddenPickersProps = {
	ticket: TicketSummary;
	// The visible column ids. A field whose column shows opens its picker from
	// that cell, so this component draws nothing for it.
	columns: readonly string[];
	editing: EditField | null;
	statuses: readonly StatusSummary[];
	projects: readonly ProjectSummary[];
	// The root project ids the ticket can move inside.
	ticketRootIds: string[];
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
// parent field has no cell at all, so its picker always lives here.
export function HiddenPickers({
	ticket,
	columns,
	editing,
	statuses,
	projects,
	ticketRootIds,
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
			{editing === "project" && !columns.includes("project") && (
				<ProjectPicker
					projects={projects}
					ticketRootIds={ticketRootIds}
					value={ticket.project.path}
					open
					onOpenChange={onEditingChange("project")}
					onPick={(project) => onChange({ project })}
					finalFocus={finalFocus}
					trigger={anchor("Project")}
				/>
			)}
			{editing === "labels" && !columns.includes("labels") && (
				<LabelPicker
					project={ticket.project.path}
					checked={ticket.labels.map((label) => label.id)}
					open
					onOpenChange={onEditingChange("labels")}
					onToggle={(label, checked) => onChange({ label, checked })}
					finalFocus={finalFocus}
					trigger={anchor("Labels")}
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
