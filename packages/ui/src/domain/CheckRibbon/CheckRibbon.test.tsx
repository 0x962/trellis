import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckRibbon } from "./CheckRibbon";

test("draws pending checks with warning shimmer and skipped checks with grey", () => {
	const html = renderToStaticMarkup(
		<CheckRibbon
			checks={[
				{ name: "Unit", bucket: "pass" },
				{ name: "Build", bucket: "pending" },
				{ name: "Preview", bucket: "skipping" },
			]}
		/>,
	);

	expect(html).toContain(
		'data-bucket="pass" style="width:20px" class="block shrink-0 rounded-hairline bg-check-ribbon-pass"',
	);
	expect(html).toContain(
		'data-bucket="pending" style="width:20px" class="block shrink-0 rounded-hairline bg-warning ribbon-shimmer motion-reduce:animate-none"',
	);
	expect(html).toContain(
		'data-bucket="skipping" style="width:20px" class="block shrink-0 rounded-hairline bg-border-strong"',
	);
});

test("names every outcome of the bar in one tooltip", () => {
	const html = renderToStaticMarkup(
		<CheckRibbon
			checks={[
				{ name: "Build", bucket: "pass" },
				{ name: "Lint", bucket: "fail" },
			]}
		/>,
	);

	expect(html).toContain('aria-label="2 checks: 1 failed, 1 passed"');
	expect(html).toContain("data-base-ui-tooltip-trigger");
	expect(html).not.toContain("title=");
});
