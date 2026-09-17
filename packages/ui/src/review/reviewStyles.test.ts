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

test("the review diff and index styles use spacing, type, and size tokens", async () => {
	const root = new URL("./", import.meta.url);
	const diff = await Bun.file(new URL("ReviewDiff/ReviewDiff.css", root)).text();
	const index = await Bun.file(new URL("review-index.css", root)).text();
	for (const css of [diff, index]) {
		expect(css).not.toMatch(/(?<![-\w])(?:0\.5|2|4|8|10|11|12|13|16|20|24|32|40|44|48|52|64|260)px/);
		expect(css).not.toMatch(/font-weight: 500/);
		expect(css).toContain("var(--spacing)");
		expect(css).toContain("var(--border-width-hairline)");
	}
	expect(diff).toContain("line-height: var(--text-base--line-height)");
	expect(diff).toContain("font-weight: var(--font-weight-medium)");
	expect(index).toContain("font-weight: var(--font-weight-medium)");
	expect(index).toContain("width: var(--review-filter-width)");
	expect(index).toContain("width: var(--review-row-icon-size)");
});
