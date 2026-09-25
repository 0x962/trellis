import { expect, test } from "bun:test";
import { classifyPageLink, pageVersionHref, parsePageDetailSearch } from "./pageLink";

test("preserves version numbers without Page list filters or lease credentials", () => {
	expect(parsePageDetailSearch({ version: "3", pin: "true", lease: "secret" })).toEqual({ version: 3 });
	for (const version of ["", "0", "-1", "1.5", "NaN", "Infinity"])
		expect(parsePageDetailSearch({ version })).toEqual({});
	expect(pageVersionHref("TRL", "report", 3)).toBe("/p/TRL/pages/report?version=3");
	expect(pageVersionHref("TRL", "report")).toBe("/p/TRL/pages/report");
});
test("permits only web links and rejects private API addresses", () => {
	for (const href of [
		"javascript:alert(1)",
		"data:text/html,hi",
		"file:///tmp/a",
		"https://me:password@other.test",
		"https://trellis.test/api/page-render/secret",
		"https://trellis.test/rpc/pages",
	])
		expect(classifyPageLink(href, "https://trellis.test")).toBeNull();
	expect(classifyPageLink("https://trellis.test/p/TRL/pages/report?version=3", "https://trellis.test")?.internal).toBe(
		true,
	);
	expect(classifyPageLink("https://example.com", "https://trellis.test")?.internal).toBe(false);
	expect(classifyPageLink("https://example.com/api/docs", "https://trellis.test")?.internal).toBe(false);
});
