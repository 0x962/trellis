import { expect, test } from "bun:test";
import { createPagePrompt } from "./createPagePrompt";

test("turns the request into one project-scoped publish instruction", () => {
	expect(createPagePrompt("TRL", "  Show the release plan.  ")).toBe(
		"Create a Page for project TRL.\n\nShow the release plan.\n\nCreate the HTML source in your workspace. Publish it with `trellis page publish`, then return the Page reference.",
	);
});
