import { create } from "zustand";

export type PageSheetState = {
	// The ticket identifier in the ticket sheet, `TRL-42`, or null while no
	// ticket sheet is open.
	ticket: string | null;
	// The URL of the pull request in the review sheet, or null while no
	// review sheet is open.
	pr: string | null;
};

// What the sheet stack holds. Every list and every page writes to this
// store to open a ticket or a pull request, and `PageSheetHost` draws what
// it holds. One store owns the stack, so no list keeps sheet state of its
// own and no two components disagree about what is on top.
export const usePageSheetStore = create<PageSheetState>()(() => ({ ticket: null, pr: null }));

export const pageSheetActions = {
	// A ticket starts a new stack. The review of the ticket before it closes
	// with it.
	openTicket: (ticket: string) => usePageSheetStore.setState({ ticket, pr: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open.
	openPullRequest: (pr: string) => usePageSheetStore.setState({ pr }),
	closeTicket: () => usePageSheetStore.setState({ ticket: null, pr: null }),
	closePullRequest: () => usePageSheetStore.setState({ pr: null }),
};
