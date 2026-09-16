import { describe, expect, test } from "bun:test";
import { isNotFound } from "@tanstack/react-router";
import { parseProjectSplat, projectHref } from "./projectPath";

const throwsNotFound = (splat: string) => {
	let thrown: unknown;
	try {
		parseProjectSplat(splat);
	} catch (error) {
		thrown = error;
	}
	expect(thrown, splat).toBeDefined();
	expect(isNotFound(thrown), splat).toBe(true);
};

describe("lib/projectPath", () => {
	// WS-37
	test("a bare key is the project board", () => {
		expect(parseProjectSplat("CDE")).toEqual({ ref: "CDE", view: "board" });
	});

	// WS-38. `board`, `table` and `settings` are the reserved slugs, so a trailing
	// one is always the view.
	test("a trailing reserved segment is the view", () => {
		expect(parseProjectSplat("CDE/board")).toEqual({ ref: "CDE", view: "board" });
		expect(parseProjectSplat("CDE/settings")).toEqual({ ref: "CDE", view: "settings" });
		expect(parseProjectSplat("CDE/web/chat")).toEqual({ ref: "CDE.web", view: "chat" });
		expect(projectHref("CDE.web", "chat")).toBe("/p/CDE/web/chat");
		expect(parseProjectSplat("CDE/notes")).toEqual({ ref: "CDE", view: "notes" });
		expect(projectHref("CDE", "notes")).toBe("/p/CDE/notes");
	});

	// WS-39. The URL keeps slashes; the API ref joins with dots. The
	// canonical spelling comes from ProjectRefStringSchema.
	test("slugs join with dots into the API ref and canonicalize case", () => {
		expect(parseProjectSplat("CDE/web/auth/board")).toEqual({ ref: "CDE.web.auth", view: "board" });
		expect(parseProjectSplat("cde/Web/auth")).toEqual({ ref: "CDE.web.auth", view: "board" });
	});

	// WS-40
	test("a reserved slug or an invalid segment inside the path is rejected", () => {
		for (const splat of ["CDE/board/web", "CDE/settings/board", "board", "CDE/a_b", "", "1CDE"]) {
			throwsNotFound(splat);
		}
	});

	// WS-41
	test("projectHref keeps slashes in the URL and omits the default view", () => {
		expect(projectHref("CDE.web.auth", "table")).toBe("/p/CDE/web/auth/table");
		expect(projectHref("CDE", "board")).toBe("/p/CDE");
		expect(projectHref("CDE.web", "settings")).toBe("/p/CDE/web/settings");
	});
});
