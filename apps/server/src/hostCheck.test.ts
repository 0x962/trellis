import { describe, expect, test } from "bun:test";
import { isAllowedHost } from "./hostCheck.ts";

// Tailscale Serve proxies https://<machine>.<tailnet>.ts.net to 127.0.0.1 and
// keeps that hostname in the Host header, so the server must serve it.
const TAILNET = "canary-jqv57w1hpl.tail4a5b4c.ts.net";

describe("isAllowedHost", () => {
	test("a hostname in allowedHosts is served, whatever its case and port", () => {
		const config = { host: "127.0.0.1", allowedHosts: [TAILNET] };

		expect(isAllowedHost(TAILNET, config)).toBe(true);
		expect(isAllowedHost(`${TAILNET}:443`, config)).toBe(true);
		expect(isAllowedHost(TAILNET.toUpperCase(), config)).toBe(true);
	});

	test("a hostname that is not in allowedHosts is refused", () => {
		const config = { host: "127.0.0.1", allowedHosts: [TAILNET] };

		expect(isAllowedHost("attacker.example", config)).toBe(false);
		expect(isAllowedHost(`evil.${TAILNET}`, config)).toBe(false);
	});

	test("the TRELLIS_HOST name, loopback names, and addresses are served with no allowedHosts", () => {
		const config = { host: "mac.lan", allowedHosts: [] };

		for (const host of ["mac.lan:4521", "localhost", "trellis.localhost", "127.0.0.1:4521", "[::1]:4521"]) {
			expect(isAllowedHost(host, config), host).toBe(true);
		}
		expect(isAllowedHost("attacker.example", config)).toBe(false);
	});

	// `trellis install` registers trellis.localhost with the gateway on port
	// 80. The gateway keeps that name in the Host header.
	test("trellis.localhost is served with the default host and no allowedHosts", () => {
		const config = { host: "127.0.0.1", allowedHosts: [] };

		expect(isAllowedHost("trellis.localhost", config)).toBe(true);
		expect(isAllowedHost("trellis.localhost:80", config)).toBe(true);
	});
});
