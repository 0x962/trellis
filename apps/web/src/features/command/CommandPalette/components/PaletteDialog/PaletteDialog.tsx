import type { Ticket } from "@trellis/api";
import { Command } from "@trellis/ui";
import { useEffect, useState } from "react";
import { commandActions, paletteOpener } from "../../../commandStore";
import type { Submenu } from "../../../rows";
import { PalettePanel } from "../PalettePanel";

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
export function PaletteDialog({ open, ready, identifier, ticket }: PaletteDialogProps) {
	const [submenu, setSubmenu] = useState<Submenu | null>(null);

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
		<Command.Dialog open={open && ready} onOpenChange={onOpenChange} finalFocus={paletteOpener}>
			{open && <PalettePanel identifier={identifier} ticket={ticket} submenu={submenu} onSubmenu={setSubmenu} />}
		</Command.Dialog>
	);
}
