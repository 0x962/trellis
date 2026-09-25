import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageViewer } from "./PageViewer";

test("mounts only the constrained frame URL with an opaque origin", () => {
	const html = renderToStaticMarkup(
		<PageViewer
			title="Report"
			version={3}
			frameUrl="/api/page-render/secret"
			frameRef={{ current: null }}
			pending={false}
			status="Page refreshed for security"
		/>,
	);
	expect(html).toContain('src="/api/page-render/secret"');
	expect(html).toContain('sandbox="allow-scripts"');
	expect(html).toContain('referrerPolicy="no-referrer"');
	expect(html).toContain('title="Report, version 3"');
	expect(html).not.toContain("allow-same-origin");
	expect(html).toContain('aria-live="polite"');
});
test("renders no frame before a lease arrives", () => {
	const html = renderToStaticMarkup(
		<PageViewer title="Report" version={3} frameUrl={null} frameRef={{ current: null }} pending status="" />,
	);
	expect(html).not.toContain("<iframe");
	expect(html).toContain("Load Page");
});
