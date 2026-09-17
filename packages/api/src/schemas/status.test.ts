import { expect, test } from "bun:test";
import { projectId, statusSummary } from "../../test/fixtures.ts";
import { StatusCreateInputSchema, StatusSchema, StatusSummarySchema, StatusUpdateInputSchema } from "./status.ts";

// The description is the manager's rulebook for the status, in markdown.
// A row that has none reads as the empty string, never as absent.
test("a status carries a markdown description of at most 2000 characters, empty by default", () => {
	const status = {
		...statusSummary(),
		projectId,
		position: 1,
		wipLimit: null,
		isDefault: false,
		createdAt: "2026-09-10T10:00:00.000Z",
		updatedAt: "2026-09-10T10:00:00.000Z",
	};
	expect(StatusSchema.parse(status).description).toBe("");
	const rulebook = "New work. **Read it**, ask in a comment when it is unclear, then start a builder.";
	expect(StatusSchema.parse({ ...status, description: rulebook }).description).toBe(rulebook);
	expect(StatusSchema.safeParse({ ...status, description: "x".repeat(2000) }).success).toBe(true);
	expect(StatusSchema.safeParse({ ...status, description: "x".repeat(2001) }).success).toBe(false);

	const create = { project: "CDE", name: "Deploy Queue", category: "started" };
	expect(StatusCreateInputSchema.parse({ ...create, description: rulebook }).description).toBe(rulebook);
	expect(StatusCreateInputSchema.safeParse({ ...create, description: "x".repeat(2001) }).success).toBe(false);
	expect(StatusUpdateInputSchema.parse({ project: "CDE", status: "todo", description: "" }).description).toBe("");
	expect(
		StatusUpdateInputSchema.safeParse({ project: "CDE", status: "todo", description: "x".repeat(2001) }).success,
	).toBe(false);
});

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

// A person types the name, the description, and the WIP limit in the status
// dialog, so each bound reads as a sentence.
test("a status field out of bounds reads as a sentence", () => {
	const create = { project: "CDE", name: "QA", category: "todo" };
	const message = (input: Record<string, unknown>) =>
		StatusCreateInputSchema.safeParse({ ...create, ...input }).error!.issues[0]!.message;
	expect(message({ name: "" })).toBe("Enter a status name of 1 to 40 characters.");
	expect(message({ name: "n".repeat(41) })).toBe("Enter a status name of 1 to 40 characters.");
	expect(message({ description: "d".repeat(2001) })).toBe("Enter a status description of 2000 characters or less.");
	expect(message({ wipLimit: 0 })).toBe("Enter a WIP limit of 1 or more.");
	expect(message({ wipLimit: 1.5 })).toBe("Enter a whole number for the WIP limit.");
});
