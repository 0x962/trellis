import { afterEach, expect, test } from "bun:test";
import { pageSheetActions, sheetParent, usePageSheetStore } from "./pageSheetStore";

afterEach(() => pageSheetActions.closeTicket());

const openStack = () => {
	pageSheetActions.openTicket("TRL-1304");
	pageSheetActions.openSession("session-1304");
	pageSheetActions.openPublishedPage({ ref: "TRL/pages/report" });
	pageSheetActions.openBrowser("https://example.com");
};

test("an external link closes back to the Page above the same session", () => {
	openStack();
	expect(sheetParent(usePageSheetStore.getState())).toBe("publishedPage");
	pageSheetActions.closeBrowser();
	expect(usePageSheetStore.getState()).toMatchObject({
		ticket: "TRL-1304",
		session: "session-1304",
		publishedPage: { ref: "TRL/pages/report" },
		browser: null,
	});
});

test("the session strip closes its Page and the sheets above that Page", () => {
	openStack();
	pageSheetActions.openSettings("account");
	pageSheetActions.returnToSession();
	expect(usePageSheetStore.getState()).toMatchObject({
		ticket: "TRL-1304",
		session: "session-1304",
		publishedPage: null,
		settings: null,
		browser: null,
	});
	expect(sheetParent(usePageSheetStore.getState())).toBe("session");
});

test("a different session cannot retain the previous session's Page", () => {
	openStack();
	pageSheetActions.openSession("session-next");
	expect(usePageSheetStore.getState()).toMatchObject({ session: "session-next", publishedPage: null, browser: null });
});

test("close the session also closes its Page", () => {
	openStack();
	pageSheetActions.closeSession();
	expect(usePageSheetStore.getState()).toMatchObject({
		ticket: "TRL-1304",
		session: null,
		publishedPage: null,
		browser: null,
	});
});
