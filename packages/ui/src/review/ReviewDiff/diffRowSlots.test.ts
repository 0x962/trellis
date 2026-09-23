import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { diffRowSlots, diffRowStyle } from "./diffRowSlots";
import { parseReviewFiles } from "./parseReviewFiles";
import { type ReviewRow, reviewRowSize } from "./reviewRows";

// `VirtualDiffRows` sets the CSS custom properties from `diffRowSlots`. These
// tests check that the numbers and the stylesheet still agree.
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

test("a code line reports the height it draws, on a mouse and on a touch screen", () => {
	expect(reviewRowSize(lineRow, diffRowSlots(false, false))).toBe(28);
	expect(diffRowStyle(false)["--review-diff-line-box"]).toBe("28px");
	expect(reviewRowSize(lineRow, diffRowSlots(true, false))).toBe(44);
	expect(diffRowStyle(true)["--review-diff-line-box"]).toBe("44px");
});

test("every box the diff sets is a box the stylesheet draws", () => {
	for (const name of Object.keys(diffRowStyle(false))) expect(css).toContain(`height: var(${name})`);
});

// A slot holds the box plus the clear space around it, so the two numbers of a
// file row differ by that space.
test("a file row reserves 16 px more than its header draws", () => {
	expect(diffRowSlots(false, false).file).toBe(48 + 16);
	expect(diffRowStyle(false)["--review-diff-file-box"]).toBe("48px");
	expect(diffRowSlots(false, false).end).toBe(16 + 16);
	expect(diffRowStyle(false)["--review-diff-end-box"]).toBe("16px");
});

// The band of a risk group is a `GroupHeader`, and that component is taller on
// a phone.
test("the row of a group takes the height of a group header", () => {
	expect(diffRowSlots(false, false).group).toBe(32);
	expect(diffRowSlots(false, true).group).toBe(48);
});

// A touch screen cannot hover. Without the @media (hover: none) rule the
// button keeps opacity: 0 on a phone.
test("the Add line comment button shows on a screen that cannot hover", () => {
	expect(css).toMatch(/@media \(hover: none\) \{\s*\.review-diff-line > button \{\s*opacity: 1;/);
});

test("hover lays a tint over the line colour, and focus draws a ring", () => {
	expect(css).toContain("background-image: linear-gradient(var(--band-translucent), var(--band-translucent))");
	expect(css).toMatch(/\.review-diff-line:focus-visible \{\s*outline: 2px solid var\(--accent\);/);
	expect(css).not.toContain("outline: 0");
});
