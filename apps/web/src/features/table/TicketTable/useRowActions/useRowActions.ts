import { useNavigate } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import type { MouseEvent } from "react";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import { pageSheetActions } from "../../../../stores/pageSheetStore";
import type { BulkPicker } from "../../BulkBar";
import type { useApplyChange } from "../../hooks/useApplyChange";
import type { BulkWrite } from "../../hooks/useBulkWrite";
import { useCopyTickets } from "../../hooks/useCopyTickets";
import type { RowSelection } from "../../hooks/useRowSelection";
import type { CopyKind } from "../../hooks/useTableHotkeys";
import type { EditField, RowChange } from "../../Row";
import { rowClickOpens } from "../rowClickOpens";

export type RowActionsOptions = {
	// The ticket of one row, or undefined when the list no longer holds it.
	findTicket: (id: string) => TicketSummary | undefined;
	selection: RowSelection;
	// The tickets of the selection, read at the moment of the write.
	selectedTickets: () => TicketSummary[];
	applyChange: ReturnType<typeof useApplyChange>;
	bulk: BulkWrite;
	// The project ref of the route, or undefined for a table over every
	// project. The bulk bar owns the labels and the epic only inside one
	// project.
	project?: string;
	// The ref of the epic that the selected tickets share, or undefined when
	// they sit in different epics. The bulk bar sets a wave only inside one
	// epic.
	epicRef?: string;
	onEditing: (editing: { id: string; field: EditField } | null) => void;
	onBulkPicker: (picker: BulkPicker) => void;
};

export type RowActions = {
	openTicket: (id: string) => void;
	openPage: (id: string) => void;
	onRowClick: (id: string, event: MouseEvent) => void;
	onRowChange: (ticket: TicketSummary, change: RowChange) => void;
	onEditingChange: (id: string, field: EditField | null) => void;
	// Opens the picker of one field: the bulk bar's picker while a selection
	// holds that field, else the inline picker of the row.
	openField: (id: string, field: EditField) => void;
	copy: (id: string, kind: CopyKind) => void;
	copyIds: () => void;
	requestDelete: (targets: readonly string[]) => void;
};

// What a click, a key or an inline picker does to the rows of the table. A
// change on a selected row writes to the whole selection. A change on a row
// the selection does not hold writes to that row alone.
export function useRowActions({
	findTicket,
	selection,
	selectedTickets,
	applyChange,
	bulk,
	project,
	epicRef,
	onEditing,
	onBulkPicker,
}: RowActionsOptions): RowActions {
	const navigate = useNavigate();
	const copier = useCopyTickets();

	// A click and Enter open the ticket in the sheet over this list, so the
	// list keeps its scroll. The `o` key opens the ticket page on its route.
	const openTicket = useStableCallback((id: string) => {
		const ticket = findTicket(id);
		if (ticket !== undefined) pageSheetActions.openTicket(ticket.identifier);
	});

	// A field key writes to the whole selection when one exists, and to the
	// focused row when none does. The bulk bar owns the labels and the epic
	// of a route with no project, so those two keys fall back to the row. The
	// bar sets a wave only when every selected ticket is in one epic.
	const barHasField = (field: EditField) => {
		if (field === "wave") return project !== undefined && epicRef !== undefined;
		return field === "labels" || field === "epic" ? project !== undefined : true;
	};

	return {
		openTicket,
		openPage: useStableCallback((id: string) =>
			navigate({ to: "/t/$identifier", params: { identifier: findTicket(id)!.identifier } }),
		),
		onRowClick: useStableCallback((id: string, event: MouseEvent) => {
			// The link that covers the whole row (`data-row-link` in `Row`) forwards
			// its plain click here, with the link as `currentTarget`.
			if (!rowClickOpens(event.target as Element, event.currentTarget as Node)) return;
			if (event.shiftKey) selection.extend(id);
			else if (event.metaKey || event.ctrlKey) selection.toggle(id);
			else openTicket(id);
		}),
		onRowChange: useStableCallback((ticket: TicketSummary, change: RowChange) => {
			if (selection.isSelected(ticket.id)) void applyChange(selectedTickets(), change, "selection");
			else void applyChange([ticket], change, "row");
		}),
		onEditingChange: useStableCallback((id: string, field: EditField | null) =>
			onEditing(field === null ? null : { id, field }),
		),
		openField: useStableCallback((id: string, field: EditField) => {
			if (selection.count > 0 && barHasField(field)) onBulkPicker(field);
			else onEditing({ id, field });
		}),
		copy: useStableCallback((id: string, kind: CopyKind) => void copier.copy(findTicket(id)!, kind)),
		copyIds: () => void copier.copyIds(selectedTickets()),
		requestDelete: (targets: readonly string[]) =>
			void bulk.remove(targets.map(findTicket).filter((ticket) => ticket !== undefined)),
	};
}
