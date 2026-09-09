import { expect, test } from "bun:test";
import { statusSummary } from "../../test/fixtures.ts";
import { StatusCreateInputSchema, StatusSummarySchema, StatusUpdateInputSchema } from "./status.ts";

// `board` and `settings` are web routes under a project path, so only a
// sub-project slug avoids them. A status named Settings gets the slug
// `settings` and its rows must parse.
test("a status slug may be a reserved project slug", () => {
	for (const slug of ["settings", "board", "in-progress"]) {
		expect(StatusSummarySchema.safeParse(statusSummary({ slug })).success, slug).toBe(true);
	}
	expect(StatusSummarySchema.safeParse(statusSummary({ slug: "In Progress" })).success).toBe(false);
});

// A status color is a token name from the palette. A raw color would bypass
// the theme, so the web could not draw it in dark mode.
test("a status color is a palette token name, never a raw color", () => {
	const create = { project: "CDE", name: "QA", category: "todo" };
	for (const color of ["fg-faint", "warning", "accent", "agent", "success", "danger"]) {
		expect(StatusCreateInputSchema.safeParse({ ...create, color }).success, color).toBe(true);
		expect(StatusUpdateInputSchema.safeParse({ project: "CDE", status: "qa", color }).success, color).toBe(true);
		expect(StatusSummarySchema.safeParse(statusSummary({ color })).success, color).toBe(true);
	}
	for (const color of ["#ff0000", "red", "rgb(255, 0, 0)", "Warning", ""]) {
		expect(StatusCreateInputSchema.safeParse({ ...create, color }).success, color).toBe(false);
		expect(StatusUpdateInputSchema.safeParse({ project: "CDE", status: "qa", color }).success, color).toBe(false);
		expect(StatusSummarySchema.safeParse(statusSummary({ color })).success, color).toBe(false);
	}
});
