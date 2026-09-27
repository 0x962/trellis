import { expect, test } from "bun:test";
import { isTerminalOriginAllowed } from "./terminalSocket.ts";

test("uses the configured HTTPS origin behind a proxy", () => {
	expect(
		isTerminalOriginAllowed(
			"https://trellis.example.com",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(true);
	expect(
		isTerminalOriginAllowed(
			"http://127.0.0.1",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(false);
});

test("uses the request origin when browser access is disabled", () => {
	expect(
		isTerminalOriginAllowed(
			"http://127.0.0.1",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			null,
		),
	).toBe(true);
	expect(
		isTerminalOriginAllowed(
			"https://foreign.example",
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			null,
		),
	).toBe(false);
});

test("accepts a bearer client without an Origin header", () => {
	expect(
		isTerminalOriginAllowed(
			undefined,
			"http://127.0.0.1/api/agent-runs/run/terminal/socket",
			"https://trellis.example.com",
		),
	).toBe(true);
});
