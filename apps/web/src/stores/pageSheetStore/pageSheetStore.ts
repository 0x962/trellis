import { create } from "zustand";

export type PageSheetState = {
	// The ticket identifier in the ticket sheet, `TRL-42`, or null while no
	// ticket sheet is open.
	ticket: string | null;
	// The URL of the pull request in the review sheet, or null while no
	// review sheet is open.
	pr: string | null;
	// The ref of the epic in the statistics sheet, or null while the sheet is
	// closed.
	stats: string | null;
};

// `PageSheetHost` draws the ticket, pull request, or statistics sheet that
// this store holds. One store owns the stack, so two components cannot open
// sibling sheets that both respond to Escape.
export const usePageSheetStore = create<PageSheetState>()(() => ({ ticket: null, pr: null, stats: null }));

export const pageSheetActions = {
	// A ticket starts a new stack. The review of the ticket before it closes
	// with it.
	openTicket: (ticket: string) => usePageSheetStore.setState({ ticket, pr: null, stats: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open.
	openPullRequest: (pr: string) => usePageSheetStore.setState({ pr, stats: null }),
	openStats: (stats: string) => usePageSheetStore.setState({ ticket: null, pr: null, stats }),
	closeTicket: () => usePageSheetStore.setState({ ticket: null, pr: null }),
	closePullRequest: () => usePageSheetStore.setState({ pr: null }),
	closeStats: () => usePageSheetStore.setState({ stats: null }),
};
