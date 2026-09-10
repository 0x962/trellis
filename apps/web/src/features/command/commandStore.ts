import { create } from "zustand";

// What the palette knows about the page under it: the ticket in context,
// the selected rows, and the route they belong to. The table, the board,
// and the peek write here; the palette reads.

// `commands` opens the section list, `search` opens on the search field
// with no command sections, `projects` opens the project picker.
export type CommandMode = "commands" | "search" | "projects";

export type CommandState = {
	open: boolean;
	mode: CommandMode;
	// The route the context belongs to.
	pathname: string;
	// The identifier of the row that holds the focus.
	focusedTicket: string | null;
	// The identifier the peek shows.
	peekTicket: string | null;
	// The identifiers of the selected rows.
	selection: string[];
};

const initial: CommandState = {
	open: false,
	mode: "commands",
	pathname: "",
	focusedTicket: null,
	peekTicket: null,
	selection: [],
};

export const useCommandStore = create<CommandState>()(() => ({ ...initial }));

const set = useCommandStore.setState;

// The element that held the focus when the palette opened. The dialog
// gives the focus back to it, so a table row keeps its place.
export const paletteOpener: { current: HTMLElement | null } = { current: null };

const rememberOpener = () => {
	const active = document.activeElement;
	paletteOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
};

export const commandActions = {
	open: (mode: CommandMode) => {
		rememberOpener();
		set({ open: true, mode });
	},
	// The focus goes back at once, so the row the palette covered keeps
	// the keyboard before the panel finishes its exit.
	close: () => {
		set({ open: false });
		paletteOpener.current?.focus();
	},
	// One key opens and closes the palette, so a second press of it lands
	// here while the palette is open.
	toggle: (mode: CommandMode) => {
		if (!useCommandStore.getState().open) rememberOpener();
		set((state) => (state.open && state.mode === mode ? { open: false } : { open: true, mode }));
	},
	// The shell that draws the palette is gone, so nothing it held is
	// still true.
	reset: () => set({ ...initial }),
	setFocusedTicket: (identifier: string | null) => set({ focusedTicket: identifier }),
	setPeekTicket: (identifier: string | null) => set({ peekTicket: identifier }),
	setSelection: (identifiers: string[]) => set({ selection: identifiers }),
	// The route the app moved to. A new route drops the ticket context and
	// the selection.
	setRoute: (pathname: string) =>
		set((state) =>
			state.pathname === pathname ? {} : { pathname, focusedTicket: null, peekTicket: null, selection: [] },
		),
};

// The ticket the This ticket section acts on. The peek wins over the
// focused row, because the peek is the closer surface.
export const contextTicket = (state: CommandState): string | null => state.peekTicket ?? state.focusedTicket;
