import { expect, test } from "bun:test";
import {
	epicHref,
	epicSplat,
	isEpicPathname,
	pageHref,
	parseProjectSplat,
	projectHref,
	projectRefOfPathname,
	projectViewOfPathname,
} from "./projectUrl";

test("epics is the epics view of the project", () => {
	expect(parseProjectSplat("OP/epics")).toEqual({ ref: "OP", view: "epics" });
	expect(parseProjectSplat("CDE/epics")).toEqual({ ref: "CDE", view: "epics" });
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

test("pages is the Pages view of the project", () => {
	expect(parseProjectSplat("OP/pages")).toEqual({ ref: "OP", view: "pages" });
	expect(projectHref("CDE", "pages")).toBe("/p/CDE/pages");
});

test("pages/<slug> is one Page even when the slug names another view", () => {
	expect(parseProjectSplat("OP/pages/release-report")).toEqual({
		ref: "OP",
		view: "page",
		page: "release-report",
	});
	expect(parseProjectSplat("OP/pages/diffs")).toEqual({ ref: "OP", view: "page", page: "diffs" });
	expect(pageHref("OP", "release-report")).toBe("/p/OP/pages/release-report");
});

test("a project ref is one segment", () => {
	expect(() => parseProjectSplat("CDE/web/auth")).toThrow();
	expect(projectRefOfPathname("/p/EPICS/routine-runtime")).toBe(null);
});

test("the epic hrefs keep slashes", () => {
	expect(projectHref("CDE", "epics")).toBe("/p/CDE/epics");
	expect(epicHref("OP", "routine-runtime")).toBe("/p/OP/epics/routine-runtime");
	expect(epicSplat("OP/routine-runtime")).toBe("OP/epics/routine-runtime");
});

test("the sidebar reads the project of an epic pathname", () => {
	expect(projectRefOfPathname("/p/OP/epics")).toBe("OP");
	expect(projectRefOfPathname("/p/OP/epics/routine-runtime")).toBe("OP");
	expect(projectRefOfPathname("/p/OP/pages")).toBe("OP");
	expect(projectRefOfPathname("/p/OP/pages/release-report")).toBe("OP");
	expect(projectRefOfPathname("/p/hardware-shop")).toBe("hardware-shop");
});

test("the sidebar reads the Pages view from list and detail paths", () => {
	expect(projectViewOfPathname("/p/TRL/pages")).toBe("pages");
	expect(projectViewOfPathname("/p/TRL/pages/release-report")).toBe("page");
	expect(projectViewOfPathname("/p/TRL/pages/diffs")).toBe("page");
	expect(projectViewOfPathname("/p/TRL/not-a-view")).toBeNull();
});

test("only the page of one epic is an epic pathname", () => {
	expect(isEpicPathname("/p/OP/epics/routine-runtime")).toBe(true);
	expect(isEpicPathname("/p/OP/epics")).toBe(false);
	expect(isEpicPathname("/p/OP/table")).toBe(false);
	expect(isEpicPathname("/all")).toBe(false);
});
