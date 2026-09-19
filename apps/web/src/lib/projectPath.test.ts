import { expect, test } from "bun:test";
import {
	epicHref,
	epicSplat,
	isEpicPathname,
	parseProjectSplat,
	projectHref,
	projectRefOfPathname,
	rootKey,
} from "./projectPath";

test("epics is the epics view of the project", () => {
	expect(parseProjectSplat("OP/epics")).toEqual({ ref: "OP", view: "epics" });
	expect(parseProjectSplat("CDE/web/auth/epics")).toEqual({ ref: "CDE.web.auth", view: "epics" });
});

test("epics/<slug> is the epic view with the slug", () => {
	expect(parseProjectSplat("OP/epics/routine-runtime")).toEqual({
		ref: "OP",
		view: "epic",
		epic: "routine-runtime",
	});
	expect(parseProjectSplat("op/Epics/Routine-Runtime")).toEqual({
		ref: "OP",
		view: "epic",
		epic: "routine-runtime",
	});
});

test("epics and a slug alone is the sub-project of the root EPICS", () => {
	expect(parseProjectSplat("epics/routine-runtime")).toEqual({ ref: "EPICS.routine-runtime", view: "board" });
	expect(projectRefOfPathname("/p/EPICS/routine-runtime")).toBe("EPICS.routine-runtime");
});

test("the epic hrefs keep slashes", () => {
	expect(projectHref("CDE.web", "epics")).toBe("/p/CDE/web/epics");
	expect(epicHref("OP", "routine-runtime")).toBe("/p/OP/epics/routine-runtime");
	expect(epicSplat("OP/routine-runtime")).toBe("OP/epics/routine-runtime");
});

test("the root key is the first segment of a project ref", () => {
	expect(rootKey("CDE.web.auth")).toBe("CDE");
	expect(rootKey("OP")).toBe("OP");
});

test("the sidebar reads the project of an epic pathname", () => {
	expect(projectRefOfPathname("/p/OP/epics")).toBe("OP");
	expect(projectRefOfPathname("/p/OP/epics/routine-runtime")).toBe("OP");
	expect(projectRefOfPathname("/p/CDE/web/epics/auth-rewrite")).toBe("CDE.web");
});

test("only the page of one epic is an epic pathname", () => {
	expect(isEpicPathname("/p/OP/epics/routine-runtime")).toBe(true);
	expect(isEpicPathname("/p/CDE/web/epics/auth-rewrite")).toBe(true);
	expect(isEpicPathname("/p/OP/epics")).toBe(false);
	expect(isEpicPathname("/p/OP/table")).toBe(false);
	expect(isEpicPathname("/all")).toBe(false);
});
