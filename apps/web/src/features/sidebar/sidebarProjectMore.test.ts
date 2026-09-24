import { expect, test } from "bun:test";
import { createProjectMoreStore } from "../../stores/projectMoreStore";
import { isMoreOpen } from "./sidebarProjectMore";

const project = "01M24SPHTX36AJ3VKTNZ263E7V";

test("a project with no stored pathname draws More shut", () => {
	expect(isMoreOpen({}, project, "/p/TRL")).toBe(false);
});

test("More is open on the pathname the person opened it on", () => {
	expect(isMoreOpen({ [project]: "/p/TRL" }, project, "/p/TRL")).toBe(true);
});

test("More is shut on every other pathname of the same project", () => {
	const paths = { [project]: "/p/TRL" };

	expect(isMoreOpen(paths, project, "/p/TRL/diffs")).toBe(false);
	expect(isMoreOpen(paths, project, "/p/TRL/epics")).toBe(false);
	expect(isMoreOpen(paths, project, "/sessions/project/TRL")).toBe(false);
});

test("the open More row of one project leaves another project shut", () => {
	expect(isMoreOpen({ "01M24SPHTX36AJ3VKTNZ263E00": "/p/TRL" }, project, "/p/TRL")).toBe(false);
});

test("a return to the pathname of the press finds no open More row", () => {
	const store = createProjectMoreStore();

	store.getState().setShownPathname("/p/TRL");
	store.getState().toggleProjectMore(project, "/p/TRL");
	store.getState().setShownPathname("/p/TRL/diffs");
	store.getState().setShownPathname("/p/TRL");

	expect(isMoreOpen(store.getState().morePathnameByProject, project, "/p/TRL")).toBe(false);
});
