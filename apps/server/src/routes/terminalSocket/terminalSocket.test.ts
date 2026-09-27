import { expect, test } from "bun:test";
import { terminalOriginAccepted } from "./terminalSocket.ts";

test("uses the configured HTTPS origin behind a proxy", () => {
	expect(
		terminalOriginAccepted(
			"https://trellis.example.com",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(true);
	expect(
		terminalOriginAccepted(
			"http://127.0.0.1",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(false);
});

test("uses the request origin when browser access is disabled", () => {
	expect(
		terminalOriginAccepted(
			"http://127.0.0.1",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			null,
		),
	).toBe(true);
	expect(
		terminalOriginAccepted(
			"https://foreign.example",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			null,
		),
	).toBe(false);
});

test("accepts a bearer client without an Origin header", () => {
	expect(
		terminalOriginAccepted(
			undefined,
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(true);
});
