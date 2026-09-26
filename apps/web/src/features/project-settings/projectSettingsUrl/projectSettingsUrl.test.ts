import { beforeEach, expect, test } from "bun:test";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { projectSettingsSection } from "./projectSettingsUrl";

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

test("the settings URL of a project opens the section its hash names", () => {
	expect(projectSettingsSection("settings", "workflow")).toBe("workflow");
});

test("the settings URL of a project with no hash opens the general section", () => {
	expect(projectSettingsSection("settings", "")).toBe("");
});

test("a hash that names no section opens the general section", () => {
	expect(projectSettingsSection("settings", "account")).toBe("");
});

test("the notes URL of a project opens the notes section", () => {
	expect(projectSettingsSection("notes", "")).toBe("notes");
});

test("the settings URL opens the sheet over the project, and closing it leaves that page", () => {
	pageSheetActions.openProjectSettings({ project: "TRL", section: projectSettingsSection("settings", "statuses") });

	expect(usePageSheetStore.getState().projectSettings).toEqual({ project: "TRL", section: "workflow" });

	pageSheetActions.closeProjectSettings();

	expect(usePageSheetStore.getState()).toEqual(closed);
});

for (const hash of ["template", "statuses", "labels"]) {
	test(`the saved ${hash} link opens Workflow`, () => {
		expect(projectSettingsSection("settings", hash)).toBe("workflow");
		expect(projectSettingsSection("notes", hash)).toBe("notes");
	});
}
