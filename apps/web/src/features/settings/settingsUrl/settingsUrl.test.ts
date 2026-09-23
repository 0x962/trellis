import { beforeEach, expect, test } from "bun:test";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { settingsBehind, settingsEntry } from "./settingsUrl";

const closed = {
	ticket: null,
	pr: null,
	session: null,
	settings: null,
	projectSettings: null,
	browser: null,
	reviewTab: null,
};

beforeEach(() => {
	usePageSheetStore.setState(closed);
});

test("the settings URL opens the sheet at the section it names", () => {
	expect(settingsEntry("notifications", false)).toEqual({ draw: "sheet", section: "notifications" });
});

test("the settings URL with no section opens the sheet at the account section", () => {
	expect(settingsEntry("", false)).toEqual({ draw: "sheet", section: "account" });
});

test("a section the app does not hold opens the account section", () => {
	expect(settingsEntry("labels", false)).toEqual({ draw: "sheet", section: "account" });
});

test("the desktop app before the first run draws the settings as a page", () => {
	expect(settingsEntry("desktop", true)).toEqual({ draw: "page", section: "desktop" });
});

test("the settings URL opens the sheet over Needs you, and closing it leaves that page", () => {
	const entry = settingsEntry("notifications", false);
	pageSheetActions.openSettings(entry.section);

	expect(settingsBehind).toBe("/needs-you");
	expect(usePageSheetStore.getState().settings).toBe("notifications");

	pageSheetActions.closeSettings();

	expect(usePageSheetStore.getState()).toEqual(closed);
});
