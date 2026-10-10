import type { Ticket } from "@trellis/api";
import { Command } from "@trellis/ui";
import { useEffect, useState } from "react";
import { CreateRelatedTicketDialog } from "../../../../composer/CreateRelatedTicketDialog";
import { useBulkWrite } from "../../../../table/hooks/useBulkWrite";
import { commandActions, paletteOpener, useCommandStore } from "../../../commandStore";
import type { Submenu } from "../../../rows";
import type { RelatedTicketRequest } from "../../relatedTicketRequest";
import { PalettePanel } from "../PalettePanel";
import { DeleteConfirm } from "./components/DeleteConfirm";

export type PaletteDialogProps = {
	open: boolean;
	// False while the first read of the ticket in context runs. The panel
	// stays closed until it is true, so its first frame is complete.
	ready: boolean;
	// The ticket the This ticket section acts on.
	identifier: string | null;
	ticket: Ticket | undefined;
};

// The panel of the Cmd-K surface and the submenu it shows. The field and
// every keystroke live in PalettePanel, which mounts on each open.
//
// PalettePanel unmounts when the palette closes. The ticket drafts and
// confirmation dialogs stay here so a palette action can close its menu
// without closing the form or losing its uploads.
export function PaletteDialog({ open, ready, identifier, ticket }: PaletteDialogProps) {
	const [ticketRequests, setTicketRequests] = useState<Record<string, RelatedTicketRequest>>({});
	const [activeTicketScope, setActiveTicketScope] = useState<string | null>(null);
	const [submenu, setSubmenu] = useState<Submenu | null>(null);
	const selectionOwner = useCommandStore((state) => state.selectionOwner);
	// A delete removes the rows, so the surface that owns the selection has
	// nothing left to keep selected.
	const bulk = useBulkWrite({ onDeleted: () => selectionOwner?.clear() });

	useEffect(() => {
		if (!open) setSubmenu(null);
	}, [open]);

	// Escape and a click outside leave an open submenu first, and close the
	// palette from the section list.
	const onOpenChange = (next: boolean) => {
		if (next) return;
		if (submenu !== null) {
			setSubmenu(null);
			return;
		}
		commandActions.close();
	};

	const closeTicket = (scope: string, completed = false) => {
		setActiveTicketScope((current) => (current === scope ? null : current));
		if (completed)
			setTicketRequests((current) => {
				const next = { ...current };
				delete next[scope];
				return next;
			});
	};
	return (
		<>
			<Command.Dialog open={open && ready} onOpenChange={onOpenChange} finalFocus={paletteOpener}>
				{open && (
					<PalettePanel
						identifier={identifier}
						ticket={ticket}
						submenu={submenu}
						onSubmenu={setSubmenu}
						bulk={bulk}
						onCreateTicket={(request) => {
							setTicketRequests((current) => ({ ...current, [request.scope]: request }));
							setActiveTicketScope(request.scope);
							commandActions.close();
						}}
					/>
				)}
			</Command.Dialog>
			{Object.values(ticketRequests).map((request) => (
				<CreateRelatedTicketDialog
					key={request.scope}
					{...request}
					open={activeTicketScope === request.scope}
					onClose={(completed) => closeTicket(request.scope, completed)}
					onCreated={(ticket) => {
						request.onCreated(ticket);
						closeTicket(request.scope, true);
					}}
				/>
			))}
			<DeleteConfirm />
			{bulk.confirmDialog}
		</>
	);
}
