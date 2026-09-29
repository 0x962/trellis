import { expect, test } from "bun:test";
import { sameOriginRouteHref } from "./sameOriginRouteHref";

const origin = "http://127.0.0.1:4521";

test("returns the route, query, and hash of a same-origin URL", () => {
	expect(sameOriginRouteHref(`${origin}/t/TRL-645?tab=activity#agent`, origin)).toBe("/t/TRL-645?tab=activity#agent");
});

test.each([
	"https://example.com/t/TRL-645",
	"trellis://ticket/01M3NS8Z3M11Q82NCJS190M54G",
	"javascript:alert(1)",
	"http://user:pass@127.0.0.1:4521/t/TRL-645",
])("does not return a same-origin route for %s", (url) => {
	expect(sameOriginRouteHref(url, origin)).toBeNull();
});
