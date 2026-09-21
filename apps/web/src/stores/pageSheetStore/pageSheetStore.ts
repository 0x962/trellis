import { create } from "zustand";

export type PageSheetState = {
	// The ticket identifier in the ticket sheet, `TRL-42`, or null while no
	// ticket sheet is open.
	ticket: string | null;
	// The URL of the pull request in the review sheet, or null while no
	// review sheet is open.
	pr: string | null;
	// The id of the agent run in the session sheet, or null while no session
	// sheet is open.
	session: string | null;
	// The ref of the epic in the statistics sheet, or null while the sheet is
	// closed.
	stats: string | null;
};

// `PageSheetHost` draws the ticket, pull request, session, or statistics
// sheet that this store holds. One store owns the stack, so two components
// cannot open sibling sheets that both respond to Escape.
export const usePageSheetStore = create<PageSheetState>()(() => ({
	ticket: null,
	pr: null,
	session: null,
	stats: null,
}));

export const pageSheetActions = {
	// A ticket starts a new stack. The review and the session of the ticket
	// before it close with it.
	openTicket: (ticket: string) => usePageSheetStore.setState({ ticket, pr: null, session: null, stats: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open. One sheet stands over a ticket, so the session of that
	// ticket closes.
	openPullRequest: (pr: string) => usePageSheetStore.setState({ pr, session: null, stats: null }),
	// The session of one agent run opens over the ticket sheet, or alone
	// when no ticket sheet is open.
	openSession: (session: string) => usePageSheetStore.setState({ session, pr: null, stats: null }),
	openStats: (stats: string) => usePageSheetStore.setState({ ticket: null, pr: null, session: null, stats }),
	closeTicket: () => usePageSheetStore.setState({ ticket: null, pr: null, session: null }),
	closePullRequest: () => usePageSheetStore.setState({ pr: null }),
	closeSession: () => usePageSheetStore.setState({ session: null }),
	closeStats: () => usePageSheetStore.setState({ stats: null }),
};
