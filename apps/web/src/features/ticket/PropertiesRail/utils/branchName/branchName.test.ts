import { describe, expect, test } from "bun:test";
import { branchName, titleSlug } from "./branchName";

describe("features/ticket/PropertiesRail/utils/branchName", () => {
	// WT-55. The branch is `<identifier>-<slug>` in lower case. The slug is
	// stored once, so a later title change leaves the branch as it was.
	test("derives a stable lower-case branch name", () => {
		const slug = titleSlug("Restore the fork pages after the upstream 1.27 merge");
		expect(slug).toBe("restore-fork-pages");
		expect(branchName("CDE-42", slug)).toBe("cde-42-restore-fork-pages");
		expect(branchName("cde-42", "Restore-Fork-Pages")).toBe("cde-42-restore-fork-pages");
		const renamed = titleSlug("Bring back every fork page");
		expect(renamed).not.toBe(slug);
		expect(branchName("CDE-42", slug)).toBe("cde-42-restore-fork-pages");
	});

	// The slug keeps the first three words that are not stop words, in
	// lower case, dashed, with punctuation dropped.
	test("titleSlug keeps the first three meaningful words of the title", () => {
		expect(titleSlug("Shell+ tabs survive an app restart")).toBe("shell-tabs-survive");
		expect(titleSlug("Fix")).toBe("fix");
		expect(titleSlug("The desktop typecheck is green")).toBe("desktop-typecheck-green");
	});
});
