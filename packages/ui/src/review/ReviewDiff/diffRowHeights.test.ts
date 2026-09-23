import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { diffRowHeights, diffRowStyle } from "./diffRowHeights";
import { parseReviewFiles } from "./parseReviewFiles";
import { type ReviewRow, reviewRowSize } from "./reviewRows";

const patch = ["diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1,1 +1,1 @@", "-one", "+two", ""].join(
	"\n",
);
const file = parseReviewFiles(patch)[0]!;
const lineRow: ReviewRow = {
	kind: "unified",
	key: "a.ts:line:0",
	file,
	line: { type: "addition", text: "two", newLine: 1 },
	annotations: [],
};

const css = readFileSync(new URL("./ReviewDiff.css", import.meta.url), "utf8");

// The stylesheet draws a row at the height the custom property carries, and
// `VirtualDiffRows` sets that property from the same numbers `reviewRowSize`
// counts. These tests hold the pair together: the first proves the numbers
// agree, and the second proves the stylesheet reads them.
test("a code line reports the height it draws, on a mouse and on a touch screen", () => {
	expect(reviewRowSize(lineRow, diffRowHeights(false))).toBe(28);
	expect(diffRowStyle(false)["--review-diff-line-box"]).toBe("28px");
	expect(reviewRowSize(lineRow, diffRowHeights(true))).toBe(44);
	expect(diffRowStyle(true)["--review-diff-line-box"]).toBe("44px");
});

test("every height the diff sets is a height the stylesheet draws", () => {
	for (const name of Object.keys(diffRowStyle(false))) expect(css).toContain(`height: var(${name})`);
});

test("a file header carries the clear space above it, and a row of a group carries none", () => {
	expect(diffRowHeights(false).file).toBe(48 + 16);
	expect(diffRowStyle(false)["--review-diff-file-box"]).toBe("48px");
	expect(diffRowHeights(false).group).toBe(32);
	expect(diffRowStyle(false)["--review-diff-group-box"]).toBe("32px");
});

// A touch screen has no pointer that hovers, so the reveal of the Add line
// comment button needs an escape or the button never appears on a phone.
test("the Add line comment button shows on a screen that cannot hover", () => {
	expect(css).toMatch(/@media \(hover: none\) \{\s*\.review-diff-line > button \{\s*opacity: 1;/);
});

// A hovered line keeps the green of an addition and the red of a deletion,
// because the tint is a layer over the colour, and the row is a button, so it
// draws a focus ring.
test("hover lays a tint over the line colour, and focus draws a ring", () => {
	expect(css).toContain("background-image: linear-gradient(var(--review-diff-hover), var(--review-diff-hover))");
	expect(css).toMatch(/\.review-diff-line:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
	expect(css).not.toContain("outline: 0");
});
