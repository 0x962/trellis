import { expect, test } from "bun:test";
import { deepLinkPath, externalUrl, sameOrigin } from "./navigation.ts";

test("deep links preserve ticket paths and reject credentials and unknown routes", () => {
	expect(deepLinkPath("trellis://open/t/RDT-1")).toBe("/t/RDT-1");
	expect(deepLinkPath("trellis://open/p/team?view=board")).toBe("/p/team?view=board");
	expect(deepLinkPath("trellis://open/settings#desktop")).toBe("/settings#desktop");
	expect(deepLinkPath("trellis://open/settings/extra")).toBeNull();
	expect(deepLinkPath("trellis://user@open/t/RDT-1")).toBeNull();
	expect(deepLinkPath("trellis://evil/t/RDT-1")).toBeNull();
	expect(deepLinkPath("trellis://open/api/tickets")).toBeNull();
	expect(deepLinkPath("https://open/t/RDT-1")).toBeNull();
});

test("renderer navigation and external links have separate allowlists", () => {
	expect(sameOrigin("http://127.0.0.1:123/t/RDT-1", "http://127.0.0.1:123")).toBe(true);
	expect(sameOrigin("http://127.0.0.1:124/", "http://127.0.0.1:123")).toBe(false);
	expect(externalUrl("https://github.com/0x962/trellis")).toBe(true);
	expect(externalUrl("file:///etc/passwd")).toBe(false);
	expect(externalUrl("javascript:alert(1)")).toBe(false);
	expect(externalUrl("https://user:secret@example.com")).toBe(false);
});
