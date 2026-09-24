import { expect, test } from "bun:test";
import { createProjectMoreStore } from "./projectMoreStore";

test("the More row of a project starts shut and opens on the pathname of the press", () => {
	const store = createProjectMoreStore();

	expect(store.getState().morePathnameByProject).toEqual({});
	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");

	expect(store.getState().morePathnameByProject).toEqual({ "project-1": "/p/TRL/epics" });
});

test("a second press on the same pathname shuts the More row again", () => {
	const store = createProjectMoreStore();

	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");
	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");

	expect(store.getState().morePathnameByProject).toEqual({});
});

test("a press on one project leaves the More row of another project shut", () => {
	const store = createProjectMoreStore();

	store.getState().toggleProjectMore("project-1", "/p/TRL/epics");
	store.getState().toggleProjectMore("project-2", "/p/CDE/epics");

	expect(store.getState().morePathnameByProject).toEqual({
		"project-1": "/p/TRL/epics",
		"project-2": "/p/CDE/epics",
	});
});

test("a change of pathname shuts the More row of every project", () => {
	const store = createProjectMoreStore();

	store.getState().setShownPathname("/p/TRL");
	store.getState().toggleProjectMore("project-1", "/p/TRL");
	store.getState().toggleProjectMore("project-2", "/p/CDE/epics");
	store.getState().setShownPathname("/p/TRL/diffs");

	expect(store.getState().morePathnameByProject).toEqual({});
});

test("the pathname the sidebar already draws keeps an open More row", () => {
	const store = createProjectMoreStore();

	store.getState().setShownPathname("/p/TRL");
	store.getState().toggleProjectMore("project-1", "/p/TRL");
	store.getState().setShownPathname("/p/TRL");

	expect(store.getState().morePathnameByProject).toEqual({ "project-1": "/p/TRL" });
});

test("a change of pathname keeps the record it finds empty", () => {
	const store = createProjectMoreStore();

	store.getState().setShownPathname("/p/TRL");
	const before = store.getState().morePathnameByProject;
	store.getState().setShownPathname("/p/TRL/diffs");

	expect(store.getState().morePathnameByProject).toBe(before);
	expect(store.getState().shownPathname).toBe("/p/TRL/diffs");
});
