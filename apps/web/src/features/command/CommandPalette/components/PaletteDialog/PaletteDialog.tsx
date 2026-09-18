import type { Ticket } from "@trellis/api";
import { Command } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useBulkWrite } from "../../../../table/hooks/useBulkWrite";
import { commandActions, paletteOpener, useCommandStore } from "../../../commandStore";
import type { Submenu } from "../../../rows";
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
// The two confirm dialogs sit beside the panel, not inside it. A palette
// action closes the palette before it runs, and PalettePanel unmounts with
// it, so a dialog inside the panel would leave the screen while the person
// answers. This component stays mounted from the first open, so it holds
// the bulk write and both dialogs.
export function PaletteDialog({ open, ready, identifier, ticket }: PaletteDialogProps) {
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

	return (
		<>
			<Command.Dialog open={open && ready} onOpenChange={onOpenChange} finalFocus={paletteOpener}>
				{open && (
					<PalettePanel identifier={identifier} ticket={ticket} submenu={submenu} onSubmenu={setSubmenu} bulk={bulk} />
				)}
			</Command.Dialog>
			<DeleteConfirm />
			{bulk.confirmDialog}
		</>
	);
}
