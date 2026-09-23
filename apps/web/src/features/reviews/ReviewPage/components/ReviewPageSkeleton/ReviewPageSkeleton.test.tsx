import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewTreeSkeleton } from "./ReviewPageSkeleton";

test("the tree skeleton reports the pending changes", () => {
	const html = renderToStaticMarkup(<ReviewTreeSkeleton />);

	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("Loading pull request changes.");
	expect(html).not.toContain("Fetch the PR revision");
	expect(html).not.toContain("Refresh from GitHub to load the diff");
});
