import { create } from "zustand";
import type { ReviewTab } from "../../features/reviews/ReviewPage/reviewTab";
import type { SettingsSectionId } from "../../features/settings/settingsUrl";

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
	// The section the settings sheet shows, or null while the settings sheet
	// is closed.
	settings: SettingsSectionId | null;
	// The address the in-app browser sheet shows, or null while the browser
	// sheet is closed.
	browser: string | null;
	// The last review tab the person selected in this browser session.
	reviewTab: ReviewTab | null;
};

// The sheet that the settings sheet and the in-app browser sheet stand
// over. `PageSheetHost`, the ticket sheet, the review sheet, and the session
// sheet each draw a `SettingsSheet` and a `BrowserSheet` and name their own
// place here. The one whose name matches draws the sheet; the others draw
// nothing.
export type SheetParent = "pullRequest" | "session" | "ticket" | "page";

// Base UI reads the dialog stack from the React tree, so a sheet that
// belongs to no page has to render inside the sheet it stands over. Opening
// the settings closes the browser, and opening a ticket closes the
// settings, so this answer never changes while either one is open.
export const sheetParent = (state: PageSheetState): SheetParent => {
	if (state.pr !== null) return "pullRequest";
	if (state.session !== null) return "session";
	if (state.ticket !== null) return "ticket";
	return "page";
};

// `PageSheetHost` draws the ticket, pull request, session, settings, or
// browser sheet that this store holds. One store owns the stack, so two
// components cannot open sibling sheets that both respond to Escape.
export const usePageSheetStore = create<PageSheetState>()(() => ({
	ticket: null,
	pr: null,
	session: null,
	settings: null,
	browser: null,
	reviewTab: null,
}));

let refreshBehindSheet: RefreshBehindSheet | null = null;

const sheetCount = (state: PageSheetState) =>
	[state.ticket, state.pr, state.session, state.settings, state.browser].filter((value) => value !== null).length;

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
	setReviewTab: (reviewTab: ReviewTab) => usePageSheetStore.setState({ reviewTab }),
	// A ticket starts a new stack. The review and the session of the ticket
	// before it close with it, and so does the settings sheet, which a
	// person can open from the command palette over any ticket.
	openTicket: (ticket: string) => setSheetState({ ticket, pr: null, session: null, settings: null, browser: null }),
	// A pull request opens over the ticket sheet, or alone when no ticket
	// sheet is open. One sheet stands over a ticket, so the session of that
	// ticket closes.
	openPullRequest: (pr: string) => setSheetState({ pr, session: null, browser: null }),
	// The session of one agent run opens over the ticket sheet, or alone
	// when no ticket sheet is open.
	openSession: (session: string) => setSheetState({ session, pr: null, browser: null }),
	// The settings open over every other sheet and leave them all open. The
	// same action moves the sheet to another section, which opens no sheet
	// and closes none.
	openSettings: (settings: SettingsSectionId) => setSheetState({ settings, browser: null }),
	// A web page opens over every other sheet and leaves them all open.
	openBrowser: (browser: string) => setSheetState({ browser }),
	closeTicket: () => setSheetState({ ticket: null, pr: null, session: null, settings: null, browser: null }),
	closePullRequest: () => setSheetState({ pr: null, browser: null }),
	closeSession: () => setSheetState({ session: null, browser: null }),
	closeSettings: () => setSheetState({ settings: null }),
	closeBrowser: () => setSheetState({ browser: null }),
	returnToTicket: () => setSheetState({ pr: null, session: null, browser: null }),
	returnToPullRequest: () => setSheetState({ browser: null }),
	returnToSession: () => setSheetState({ browser: null }),
};
