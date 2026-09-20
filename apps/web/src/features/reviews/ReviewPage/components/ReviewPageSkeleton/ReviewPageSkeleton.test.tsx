import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewPageSkeleton } from "./ReviewPageSkeleton";

test("the review skeleton reports the pending changes", () => {
	const html = renderToStaticMarkup(<ReviewPageSkeleton />);

	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("Loading pull request changes.");
	expect(html).not.toContain("Fetch the PR revision");
	expect(html).not.toContain("Refresh from GitHub to load the diff");
});

test("the review skeleton takes the shape of the file list and the diff box", () => {
	const html = renderToStaticMarkup(<ReviewPageSkeleton />);

	expect(html).toContain("review-diff-window");
	expect(html).toContain("review-diff-toolbar");
	expect(html).not.toContain("review-main");
	expect(html).not.toContain("review-files");
	expect(html).not.toContain("review-content");
});
