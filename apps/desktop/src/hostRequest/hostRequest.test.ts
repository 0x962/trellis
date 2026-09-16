import { expect, test } from "bun:test";
import { hostRequest } from "./hostRequest.ts";

test("host credentials reach HTTP and WebSocket requests for the exact host", () => {
	const origin = "http://127.0.0.1:4521";
	expect(hostRequest("http://127.0.0.1:4521/api/health", origin)).toBe(true);
	expect(hostRequest("ws://127.0.0.1:4521/api/agent-runs/a/terminal/socket", origin)).toBe(true);
	expect(hostRequest("ws://127.0.0.1:4522/", origin)).toBe(false);
	expect(hostRequest("ws://foreign.test:4521/", origin)).toBe(false);
	expect(hostRequest("wss://127.0.0.1:4521/", origin)).toBe(false);
	expect(hostRequest("ws://user@127.0.0.1:4521/", origin)).toBe(false);
	expect(hostRequest("file:///tmp/x", origin)).toBe(false);
});
