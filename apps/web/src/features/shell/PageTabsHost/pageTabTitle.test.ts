import { expect, test } from "bun:test";
import { pageTabTitle } from "./pageTabTitle";

test("removes the application name from a page title", () => {
	expect(pageTabTitle("Needs you · trellis")).toBe("Needs you");
	expect(pageTabTitle("Review this pull request · Trellis")).toBe("Review this pull request");
});

test("keeps a record title and supplies a label for an empty title", () => {
	expect(pageTabTitle("TRL-645 · Connect internal navigation")).toBe("TRL-645 · Connect internal navigation");
	expect(pageTabTitle("")).toBe("Trellis");
});
