import { beforeEach, expect, test } from "bun:test";
import { pageSheetActions, usePageSheetStore } from "./pageSheetStore";

const state = () => usePageSheetStore.getState();

beforeEach(() => {
	pageSheetActions.setRefreshBehindSheet(null);
	usePageSheetStore.setState({ ticket: null, pr: null, session: null, stats: null });
});

test("the stack starts empty", () => {
	expect(state()).toEqual({ ticket: null, pr: null, session: null, stats: null });
});

test("a pull request opens over the ticket and leaves it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ticket: "TRL-42", pr: "https://github.com/o/r/pull/7", session: null, stats: null });
});

test("a pull request opens with no ticket under it", () => {
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ticket: null, pr: "https://github.com/o/r/pull/7", session: null, stats: null });
});

test("closing the pull request leaves the ticket open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closePullRequest();

	expect(state()).toEqual({ ticket: "TRL-42", pr: null, session: null, stats: null });
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

test("closing the ticket closes the pull request over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closeTicket();

	expect(state()).toEqual({ ticket: null, pr: null, session: null, stats: null });
});

test("another ticket closes the pull request of the ticket before it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openTicket("TRL-43");

	expect(state()).toEqual({ ticket: "TRL-43", pr: null, session: null, stats: null });
});

test("statistics opens as the only sheet", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openStats("TRL/runtime");

	expect(state()).toEqual({ ticket: null, pr: null, session: null, stats: "TRL/runtime" });
});

test("a session opens over the ticket and leaves it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");

	expect(state()).toEqual({ ticket: "TRL-42", pr: null, session: "01M32TW0000000000000WRK001", stats: null });
});

test("a session replaces the pull request over the same ticket", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");

	expect(state()).toEqual({ ticket: "TRL-42", pr: null, session: "01M32TW0000000000000WRK001", stats: null });
});

test("closing the session leaves the ticket open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");
	pageSheetActions.closeSession();

	expect(state()).toEqual({ ticket: "TRL-42", pr: null, session: null, stats: null });
});

test("closing the ticket closes the session over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSession("01M32TW0000000000000WRK001");
	pageSheetActions.closeTicket();

	expect(state()).toEqual({ ticket: null, pr: null, session: null, stats: null });
});
