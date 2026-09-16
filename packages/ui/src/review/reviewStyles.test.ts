import { expect, test } from "bun:test";

test("review styles keep component rules split and use design tokens", async () => {
	const root = new URL("./", import.meta.url);
	const review = await Bun.file(new URL("review.css", root)).text();
	const tree = await Bun.file(new URL("review-tree.css", root)).text();
	expect(review.split("\n").length).toBeLessThanOrEqual(300);
	expect(await Bun.file(new URL("ReviewDiff/ReviewDiff.css", root)).exists()).toBe(true);
	expect(tree).not.toMatch(/(?<![-\w])(?:0\.5|4|5|6|8|11|12|14|16)px/);
	expect(tree).toContain("var(--border-width-hairline)");
	expect(tree).toContain("var(--text-sm)");
	expect(tree).toContain("var(--text-xs)");
});
