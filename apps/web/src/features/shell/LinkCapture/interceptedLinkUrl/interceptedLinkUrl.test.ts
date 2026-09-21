import { describe, expect, test } from "bun:test";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

const link = { href: "https://github.com/o/r", target: "_blank" };

describe("interceptedLinkUrl", () => {
	test("takes an HTTPS link that asks for a new tab", () => {
		expect(interceptedLinkUrl(link, false, true)).toBe("https://github.com/o/r");
	});

	test("leaves a link that stays in the app", () => {
		expect(interceptedLinkUrl({ href: "https://github.com/o/r", target: "" }, false, true)).toBeNull();
	});

	test("leaves a click with a modifier key", () => {
		expect(interceptedLinkUrl(link, true, true)).toBeNull();
	});

	test("leaves every link in the browser build", () => {
		expect(interceptedLinkUrl(link, false, false)).toBeNull();
	});

	test("leaves an address the desktop browser refuses", () => {
		expect(interceptedLinkUrl({ href: "http://example.com", target: "_blank" }, false, true)).toBeNull();
		expect(interceptedLinkUrl(null, false, true)).toBeNull();
	});
});
