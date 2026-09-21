import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckRibbon } from "./CheckRibbon";

test("draws pending checks with warning shimmer and skipped checks with grey", () => {
	const html = renderToStaticMarkup(
		<CheckRibbon
			checks={[
				{ name: "Build", bucket: "pending" },
				{ name: "Preview", bucket: "skipping" },
			]}
		/>,
	);

	expect(html).toContain(
		'data-bucket="pending" title="Build: pending" style="width:31px" class="block shrink-0 rounded-hairline bg-warning ribbon-shimmer motion-reduce:animate-none"',
	);
	expect(html).toContain(
		'data-bucket="skipping" title="Preview: skipped" style="width:31px" class="block shrink-0 rounded-hairline bg-border-strong"',
	);
});
