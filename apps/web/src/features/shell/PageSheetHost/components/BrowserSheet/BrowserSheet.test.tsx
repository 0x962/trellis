import { describe, expect, test } from "bun:test";
import { LINK_BROWSER_PARTITION, LINK_BROWSER_WEB_PREFERENCES } from "@trellis/api";

describe("BrowserSheet", () => {
	test("uses the partition and web preferences that the desktop handler enforces", () => {
		expect(LINK_BROWSER_PARTITION).toBe("persist:trellis-link-browser");
		expect(LINK_BROWSER_WEB_PREFERENCES).toBe("nodeIntegration=no,sandbox=yes");
	});
});
