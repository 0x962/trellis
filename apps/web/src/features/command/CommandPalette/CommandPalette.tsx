import { Command } from "@trellis/ui";
import { useEffect, useState } from "react";
import { commandActions, contextTicket, paletteOpener, useCommandStore } from "../commandStore";
import { useContextTicket } from "../hooks/useContextTicket";
import type { Submenu } from "../rows";
import { PalettePanel } from "./components/PalettePanel";

// The Cmd-K surface. It draws the sections for the context under it, runs
// the search, and calls the same procedures the pages call. The ticket in
// context is read while the palette is closed, and the panel waits for
// that read, so the first frame it draws is the whole This ticket section.
export function CommandPalette() {
	const open = useCommandStore((state) => state.open);
	const identifier = useCommandStore(contextTicket);
	const context = useContextTicket(identifier);
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
		<Command.Dialog open={open && context.ready} onOpenChange={onOpenChange} finalFocus={paletteOpener}>
			{open && (
				<PalettePanel identifier={identifier} ticket={context.ticket} submenu={submenu} onSubmenu={setSubmenu} />
			)}
		</Command.Dialog>
	);
}
