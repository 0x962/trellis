import { lazy, Suspense, useEffect, useState } from "react";
import { preloadOnIdle } from "../../../lib/preloadOnIdle";
import { commandActions, contextTicket, useCommandStore } from "../commandStore";
import { useContextTicket } from "../hooks/useContextTicket";

// The dialog holds cmdk, the row builders, and the search. It is a lazy
// chunk, so the entry chunk carries only this host.
const loadPaletteDialog = () => import("./components/PaletteDialog");
const PaletteDialog = lazy(() => loadPaletteDialog().then((module) => ({ default: module.PaletteDialog })));

// The Cmd-K surface. It draws the sections for the context under it, runs
// the search, and calls the same procedures the pages call. The ticket in
// context is read while the palette is closed, and the panel waits for
// that read, so the first frame it draws is the whole This ticket section.
//
// The dialog mounts on the first open and stays mounted, so each close
// runs its exit transition. Its chunk loads when the browser is idle, so
// the first Cmd+K does not wait on the network.
export function CommandPalette() {
	const open = useCommandStore((state) => state.open);
	const identifier = useCommandStore(contextTicket);
	const context = useContextTicket(identifier);
	const [mounted, setMounted] = useState(open);
	if (open && !mounted) setMounted(true);

	useEffect(() => preloadOnIdle(loadPaletteDialog), []);

	// The palette lives with the shell that draws it.
	useEffect(() => commandActions.reset, []);

	if (!mounted) return null;
	return (
		<Suspense fallback={null}>
			<PaletteDialog open={open} ready={context.ready} identifier={identifier} ticket={context.ticket} />
		</Suspense>
	);
}
