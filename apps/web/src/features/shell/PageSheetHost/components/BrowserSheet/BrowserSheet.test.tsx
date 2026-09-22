import { describe, expect, test } from "bun:test";
import { LINK_BROWSER_PARTITION, LINK_BROWSER_WEB_PREFERENCES } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { BrowserPage } from "./components/BrowserPage";

describe("BrowserSheet", () => {
	test("uses the partition and web preferences that the desktop handler enforces", () => {
		expect(LINK_BROWSER_PARTITION).toBe("persist:trellis-link-browser");
		expect(LINK_BROWSER_WEB_PREFERENCES).toBe("nodeIntegration=no,sandbox=yes");
	});

	test("puts copy link in the browser header", () => {
		const html = renderToStaticMarkup(<BrowserPage url="https://github.com/0x962/trellis/pull/1" />);

		expect(html).toMatch(/<button[^>]*aria-label="Copy link"/);
		expect(html.indexOf('aria-label="Copy link"')).toBeLessThan(html.indexOf('aria-label="Open in browser"'));
	});
});
