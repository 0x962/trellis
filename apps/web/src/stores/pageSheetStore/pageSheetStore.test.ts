import { beforeEach, expect, test } from "bun:test";
import { pageSheetActions, sheetParent, usePageSheetStore } from "./pageSheetStore";

const state = () => usePageSheetStore.getState();

const empty = {
	ticket: null,
	pr: null,
	session: null,
	settings: null,
	projectSettings: null,
	browser: null,
	reviewTab: null,
};

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
		...empty,
		ticket: "TRL-42",
		pr: "https://github.com/o/r/pull/7",
		browser: "https://github.com/o/r/pull/7",
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

test("the settings open over the ticket and leave it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSettings("account");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", settings: "account" });
});

test("closing the settings leaves the page behind it and the ticket open", () => {
	let refreshes = 0;
	pageSheetActions.setRefreshBehindSheet(() => refreshes++);
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openSettings("account");
	pageSheetActions.closeSettings();

	expect(refreshes).toBe(1);
	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("another section keeps the settings open", () => {
	pageSheetActions.openSettings("account");
	pageSheetActions.openSettings("notifications");

	expect(state()).toEqual({ ...empty, settings: "notifications" });
});

test("a ticket closes the settings over it", () => {
	pageSheetActions.openSettings("account");
	pageSheetActions.openTicket("TRL-42");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});

test("the settings close the browser under them", () => {
	pageSheetActions.openBrowser("https://trellis.dev");
	pageSheetActions.openSettings("account");

	expect(state()).toEqual({ ...empty, settings: "account" });
});

test("the browser stands over the topmost sheet", () => {
	expect(sheetParent(empty)).toBe("page");
	expect(sheetParent({ ...empty, ticket: "TRL-42" })).toBe("ticket");
	expect(sheetParent({ ...empty, ticket: "TRL-42", pr: "https://github.com/o/r/pull/7" })).toBe("pullRequest");
	expect(sheetParent({ ...empty, ticket: "TRL-42", session: "01M32TW0000000000000WRK001" })).toBe("session");
});

test("the settings of a project open over the ticket and leave it open", () => {
	pageSheetActions.openTicket("TRL-42");
	pageSheetActions.openProjectSettings({ project: "TRL", section: "notes" });

	expect(state()).toEqual({ ...empty, ticket: "TRL-42", projectSettings: { project: "TRL", section: "notes" } });
});

test("another section keeps the settings of the project open", () => {
	pageSheetActions.openProjectSettings({ project: "TRL", section: "" });
	pageSheetActions.openProjectSettings({ project: "TRL", section: "labels" });

	expect(state()).toEqual({ ...empty, projectSettings: { project: "TRL", section: "labels" } });
});

test("closing the settings of a project leaves the page behind it", () => {
	let refreshes = 0;
	pageSheetActions.setRefreshBehindSheet(() => refreshes++);
	pageSheetActions.openProjectSettings({ project: "TRL", section: "" });
	pageSheetActions.closeProjectSettings();

	expect(refreshes).toBe(1);
	expect(state()).toEqual(empty);
});

test("the settings of the app and the settings of a project close each other", () => {
	pageSheetActions.openProjectSettings({ project: "TRL", section: "" });
	pageSheetActions.openSettings("account");

	expect(state()).toEqual({ ...empty, settings: "account" });

	pageSheetActions.openProjectSettings({ project: "TRL", section: "" });

	expect(state()).toEqual({ ...empty, projectSettings: { project: "TRL", section: "" } });
});

test("a ticket closes the settings of a project over it", () => {
	pageSheetActions.openProjectSettings({ project: "TRL", section: "" });
	pageSheetActions.openTicket("TRL-42");

	expect(state()).toEqual({ ...empty, ticket: "TRL-42" });
});
