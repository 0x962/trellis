import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MergeConflictMark } from "./MergeConflictMark";

test("draws the Octicons alert triangle in the warning colour and names the base branch", () => {
	const html = renderToStaticMarkup(<MergeConflictMark baseRef="main" />);

	expect(html).toContain('aria-label="Merge conflict with main"');
	expect(html).toContain("text-warning");
	expect(html).toContain("octicon-alert");
});
