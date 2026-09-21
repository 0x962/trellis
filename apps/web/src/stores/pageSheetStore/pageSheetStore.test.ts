import { beforeEach, expect, test } from "bun:test";
import { pageSheetActions, usePageSheetStore } from "./pageSheetStore";

const state = () => usePageSheetStore.getState();

beforeEach(() => usePageSheetStore.setState({ ticket: null, pr: null }));

test("the stack starts empty", () => {
	expect(state()).toEqual({ ticket: null, pr: null });
});

test("a pull request opens over the ticket and leaves it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" });
});

test("a pull request opens with no ticket under it", () => {
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");

	expect(state()).toEqual({ ticket: null, pr: "https://github.com/o/r/pull/7" });
});

test("closing the pull request leaves the ticket open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closePullRequest();

	expect(state()).toEqual({ ticket: "TRL-42", pr: null });
});

test("closing the ticket closes the pull request over it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.closeTicket();

	expect(state()).toEqual({ ticket: null, pr: null });
});

test("another ticket closes the pull request of the ticket before it", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openPullRequest("https://github.com/o/r/pull/7");
	pageSheetActions.openTicket("TRL-43");

	expect(state()).toEqual({ ticket: "TRL-43", pr: null });
});
