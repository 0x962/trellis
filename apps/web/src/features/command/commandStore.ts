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

export const commandActions = {
	open: (_mode: CommandMode) => {},
	close: () => {},
	setFocusedTicket: (_identifier: string | null) => {},
	setPeekTicket: (_identifier: string | null) => {},
	setSelection: (_identifiers: string[]) => {},
	// The route the app moved to. A new route drops the ticket context and
	// the selection.
	setRoute: (_pathname: string) => {},
};

// The ticket the This ticket section acts on. The peek wins over the
// focused row, because the peek is the closer surface.
export const contextTicket = (_state: CommandState): string | null => null;
