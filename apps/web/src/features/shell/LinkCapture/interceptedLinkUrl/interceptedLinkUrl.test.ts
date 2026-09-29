import { expect, test } from "bun:test";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

const origin = "http://127.0.0.1:4521";
test.each(["http://example.com", "https://example.com"])("captures %s", (href) => {
	expect(interceptedLinkUrl({ href }, true, origin, false)).toBe(href);
});
test("captures an app route only for a new Trellis tab", () => {
	const href = `${origin}/t/TRL-645?tab=activity#agent`;
	expect(interceptedLinkUrl({ href }, true, origin, false)).toBeNull();
	expect(interceptedLinkUrl({ href }, true, origin, true)).toBe(href);
});
test("keeps unsupported protocols outside the link handler", () => {
	for (const href of ["mailto:a@example.com", "javascript:alert(1)", "https://user:pass@example.com"]) {
		expect(interceptedLinkUrl({ href }, true, origin, true)).toBeNull();
	}
	expect(interceptedLinkUrl(null, true, origin, true)).toBeNull();
	expect(interceptedLinkUrl({ href: "https://example.com" }, false, origin, true)).toBeNull();
});
