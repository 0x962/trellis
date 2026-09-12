import { expect, test } from "bun:test";
import { gatewayTarget } from "./target";

test("preserves unrelated routes and redirects legacy Margin links into Trellis", () => {
	expect(gatewayTarget("http://other.localhost/path?q=1", { other: 9999 })).toEqual({
		kind: "proxy",
		url: "http://127.0.0.1:9999/path?q=1",
	});
	expect(gatewayTarget("http://margin.localhost/https://github.com/o/r/pull/12", { trellis: 4521 })).toEqual({
		kind: "redirect",
		url: "http://trellis.localhost/reviews/o/r/12",
	});
	expect(gatewayTarget("http://dots.localhost/runs", { dots: 4517 })?.kind).toBe("proxy");
	expect(gatewayTarget("http://unregistered.localhost/", {})).toBeNull();
});
