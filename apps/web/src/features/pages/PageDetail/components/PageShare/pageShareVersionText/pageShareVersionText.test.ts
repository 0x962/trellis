import { expect, test } from "bun:test";
import { pageShareVersionText } from "./pageShareVersionText";

test("states that a current Page link opens its current version", () => {
	expect(pageShareVersionText(2, 2)).toBe("This link opens the current version of the Page.");
});

test("distinguishes a historical preview from the version that its Page link opens", () => {
	expect(pageShareVersionText(1, 2)).toBe("This link opens the current version of the Page, not version 1.");
});
