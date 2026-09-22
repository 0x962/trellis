import { beforeEach, expect, test } from "bun:test";
import { browserParent, pageSheetActions, usePageSheetStore } from "./pageSheetStore";

const state = () => usePageSheetStore.getState();

const empty = { ticket: null, pr: null, session: null, stats: null, browser: null, reviewTab: null };

beforeEach(() => {
	pageSheetActions.setRefreshBehindSheet(null);
	usePageSheetStore.setState(empty);
});

test("the stack starts empty", () => {
	expect(state()).toEqual(empty);
});

test("a pull request opens over the ticket and leaves it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" });
});

test("a pull request opens with no ticket under it", () => {
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ...empty, pr: "https://github.com/o/r/pull/7" });
});

test("closing the pull request leaves the ticket open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closePullRequest();

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("the last review tab stays after the pull request sheet closes", () => {
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.setReviewTab("diff");
	pageSheetActions.closePullRequest();
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/8");

	expect(state()).toEqual({ ...empty, pr: "https://github.com/o/r/pull/8", reviewTab: "diff" });
});

test("closing a sheet refreshes the page behind it", () => {
	let refreshes = 0;
	pageSheetActions.setRefreshBehindSheet(() => refreshes++);
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	pageSheetActions.closePullRequest();
	pageSheetActions.closeTicket();

	expect(refreshes).toBe(2);
});

test("closing the browser refreshes the page behind it", () => {
	let refreshes = 0;
	pageSheetActions.setRefreshBehindSheet(() => refreshes++);
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");

	pageSheetActions.closeBrowser();

	expect(refreshes).toBe(1);
	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("closing the ticket closes the pull request over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closeTicket();

	expect(state()).toEqual(empty);
});

test("another ticket closes the pull request of the ticket before it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openTicket("TRL-43");

	expect(state()).toEqual({ ...empty, ticket: "TRL-43" });
});

test("statistics opens as the only sheet", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openStats("TRL/runtime");

	expect(state()).toEqual({ ...empty, stats: "TRL/runtime" });
});

test("a session opens over the ticket and leaves it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", session: "01M32TW0000000000000WRK001" });
});

test("a session replaces the pull request over the same ticket", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", session: "01M32TW0000000000000WRK001" });
});

test("closing the session leaves the ticket open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");
	pageSheetActions.closeSession();

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("closing the ticket closes the session over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");
	pageSheetActions.closeTicket();

	expect(state()).toEqual(empty);
});

test("the browser opens over the pull request and leaves the stack open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");

	expect(state()).toEqual({
		ticket: "TRL-42",
		pr: "https://github.com/o/r/pull/7",
		session: null,
		stats: null,
		browser: "https://github.com/o/r/pull/7",
		reviewTab: null,
	});
});

test("closing the browser leaves the pull request open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");
	pageSheetActions.closeBrowser();

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" });
});

test("returning to the ticket closes every sheet over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");
	pageSheetActions.returnToTicket();

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("returning to the pull request closes the browser over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");
	pageSheetActions.returnToPullRequest();

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" });
});

test("closing the pull request closes the browser over it", () => {
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");
	pageSheetActions.closePullRequest();

	expect(state()).toEqual(empty);
});

test("another sheet closes the browser", () => {
	pageSheetActions.openBrowser("https://github.com/o/r/pull/7");
	pageSheetActions.openTicket("TRL-42");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("the browser stands over the topmost sheet", () => {
	expect(browserParent(empty)).toBe("page");
	expect(browserParent({ ...empty, ticket: "TRL-42" })).toBe("ticket");
	expect(browserParent({ ...empty, ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" })).toBe("pullRequest");
	expect(browserParent({ ...empty, ticket: "TRL-42", session: "01M32TW0000000000000WRK001" })).toBe("session");
	expect(browserParent({ ...empty, stats: "TRL/runtime" })).toBe("stats");
});
