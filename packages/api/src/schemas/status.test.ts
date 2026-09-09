import { expect, test } from "bun:test";
import { statusSummary } from "../../test/fixtures.ts";
import { StatusSummarySchema } from "./status.ts";

// `board` and `settings` are web routes under a project path, so only a
// sub-project slug avoids them. A status named Settings gets the slug
// `settings` and its rows must parse.
test("a status slug may be a reserved project slug", () => {
	for (const slug of ["settings", "board", "in-progress"]) {
		expect(StatusSummarySchema.safeParse(statusSummary({ slug })).success, slug).toBe(true);
	}
	expect(StatusSummarySchema.safeParse(statusSummary({ slug: "In Progress" })).success).toBe(false);
});
