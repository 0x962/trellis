import { describe, expect, test } from "bun:test";
import {
	isLinkBrowserUrl,
	LINK_BROWSER_NODE_INTEGRATION,
	LINK_BROWSER_PARTITION,
	LINK_BROWSER_SANDBOX,
	LINK_BROWSER_WEB_PREFERENCES,
} from "./linkBrowser.ts";

describe("linkBrowser", () => {
	test("defines one isolated browser configuration", () => {
		expect(LINK_BROWSER_PARTITION).toBe("persist:trellis-link-browser");
		expect(LINK_BROWSER_NODE_INTEGRATION).toBe(false);
		expect(LINK_BROWSER_SANDBOX).toBe(true);
		expect(LINK_BROWSER_WEB_PREFERENCES).toBe("nodeIntegration=no,sandbox=yes");
	});

	test("allows only HTTPS addresses", () => {
		expect(isLinkBrowserUrl("https://example.com")).toBe(true);
		expect(isLinkBrowserUrl("http://example.com")).toBe(false);
		expect(isLinkBrowserUrl("not a URL")).toBe(false);
		expect(isLinkBrowserUrl(undefined)).toBe(false);
	});
});
