import { expect, test } from "bun:test";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

const origin = "http://127.0.0.1:4521";
test.each(["http://example.com", "https://example.com"])("captures %s with either target", (href) => {
	for (const target of ["", "_blank"]) expect(interceptedLinkUrl({ href, target }, true, origin)).toBe(href);
});
test("keeps app routes, downloads and non-web protocols outside the slideout", () => {
	for (const href of [
		`${origin}/t/TRL-638`,
		"mailto:a@example.com",
		"javascript:alert(1)",
		"https://user:pass@example.com",
	]) {
		expect(interceptedLinkUrl({ href, target: "_blank" }, true, origin)).toBeNull();
	}
	expect(interceptedLinkUrl(null, true, origin)).toBeNull();
	expect(interceptedLinkUrl({ href: "https://example.com", target: "" }, false, origin)).toBeNull();
});
