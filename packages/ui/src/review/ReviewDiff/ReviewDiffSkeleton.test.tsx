import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDiffSkeleton } from "./ReviewDiffSkeleton";

test("the diff skeleton takes the shape of the diff box and its toolbar", () => {
	const html = renderToStaticMarkup(<ReviewDiffSkeleton />);

	expect(html).toContain("review-diff-window");
	expect(html).toContain("review-diff-toolbar");
	expect(html).not.toContain("review-main");
	expect(html).not.toContain("review-content");
});
