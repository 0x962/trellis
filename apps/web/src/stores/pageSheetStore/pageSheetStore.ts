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
	// The address the in-app browser sheet shows, or null while the browser
	// sheet is closed.
	browser: string | null;
};

// The sheet that the in-app browser stands over. `PageSheetHost`, the ticket
// sheet, the review sheet, the session sheet, and the statistics sheet each
// draw a `BrowserSheet` and name their own place here. The one whose name
// matches draws the browser; the others draw nothing.
export type BrowserParent = "pullRequest" | "session" | "stats" | "ticket" | "page";

// Base UI reads the dialog stack from the React tree, so the browser sheet
// has to render inside the sheet it stands over. Every action that opens or
// closes another sheet also closes the browser, so this answer never changes
// while the browser is open.
export const browserParent = (state: PageSheetState): BrowserParent => {
	if (state.pr !== null) return "pullRequest";
	if (state.session !== null) return "session";
	if (state.stats !== null) return "stats";
	if (state.ticket !== null) return "ticket";
	return "page";
};

// `PageSheetHost` draws the ticket, pull request, session, statistics, or
// browser sheet that this store holds. One store owns the stack, so two
// components cannot open sibling sheets that both respond to Escape.
export const usePageSheetStore = create<PageSheetState>()(() => ({
	ticket: null,
	pr: null,
	session: null,
	stats: null,
	browser: null,
}));

export const pageSheetActions = {
	// A ticket starts a new stack. The review and the session of the ticket
	// before it close with it.
	openTicket: (ticket: string) =>
		usePageSheetStore.setState({ ticket, pr: null, session: null, stats: null, browser: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open. One sheet stands over a ticket, so the session of that
	// ticket closes.
	openPullRequest: (pr: string) => usePageSheetStore.setState({ pr, session: null, stats: null, browser: null }),
	// The session of one agent run opens over the ticket sheet, or alone
	// when no ticket sheet is open.
	openSession: (session: string) => usePageSheetStore.setState({ session, pr: null, stats: null, browser: null }),
	openStats: (stats: string) =>
		usePageSheetStore.setState({ ticket: null, pr: null, session: null, stats, browser: null }),
	// A web page opens over every other sheet and leaves them all open.
	openBrowser: (browser: string) => usePageSheetStore.setState({ browser }),
	closeTicket: () => usePageSheetStore.setState({ ticket: null, pr: null, session: null, browser: null }),
	closePullRequest: () => usePageSheetStore.setState({ pr: null, browser: null }),
	closeSession: () => usePageSheetStore.setState({ session: null, browser: null }),
	closeStats: () => usePageSheetStore.setState({ stats: null, browser: null }),
	closeBrowser: () => usePageSheetStore.setState({ browser: null }),
};
