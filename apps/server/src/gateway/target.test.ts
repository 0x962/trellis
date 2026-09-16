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

// A person writes the routes file, so it can hold a value that is no TCP
// port. The gateway answers 502 with this message instead of a crash.
test("a routes entry that holds no TCP port names itself in an invalid target", () => {
	expect(gatewayTarget("http://dots.localhost/runs", { dots: 0 })).toEqual({
		kind: "invalid",
		message: "Invalid gateway port for dots.",
	});
	for (const port of [-1, 65536, 4517.5, Number.NaN, "4517" as unknown as number]) {
		expect(gatewayTarget("http://dots.localhost/runs", { dots: port })?.kind, String(port)).toBe("invalid");
	}
});
