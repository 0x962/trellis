import { create } from "zustand";

type RefreshBehindSheet = () => void;

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

let refreshBehindSheet: RefreshBehindSheet | null = null;

const sheetCount = (state: PageSheetState) =>
	[state.ticket, state.pr, state.session, state.stats].filter((value) => value !== null).length;

const setSheetState = (next: Partial<PageSheetState>) => {
	let shouldRefresh = false;
	usePageSheetStore.setState((state) => {
		const updated = { ...state, ...next };
		shouldRefresh = sheetCount(updated) < sheetCount(state);
		return updated;
	});
	if (shouldRefresh) refreshBehindSheet?.();
};

export const pageSheetActions = {
	setRefreshBehindSheet: (refresh: RefreshBehindSheet | null) => {
		refreshBehindSheet = refresh;
	},
	// A ticket starts a new stack. The review and the session of the ticket
	// before it close with it.
	openTicket: (ticket: string) => setSheetState({ ticket, pr: null, session: null, stats: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open. One sheet stands over a ticket, so the session of that
	// ticket closes.
	openPullRequest: (pr: string) => setSheetState({ pr, session: null, stats: null }),
	// The session of one agent run opens over the ticket sheet, or alone
	// when no ticket sheet is open.
	openSession: (session: string) => setSheetState({ session, pr: null, stats: null }),
	openStats: (stats: string) => setSheetState({ ticket: null, pr: null, session: null, stats }),
	closeTicket: () => setSheetState({ ticket: null, pr: null, session: null }),
	closePullRequest: () => setSheetState({ pr: null }),
	closeSession: () => setSheetState({ session: null }),
	closeStats: () => setSheetState({ stats: null }),
};
