import { expect, test } from "bun:test";
import { apiVersion, fakeServer } from "../test/fakeServer.ts";
import { ticket } from "../test/fixtures.ts";
import { createClient } from "./client.ts";

test("the CLI authenticates requests to its desktop host", async () => {
	const server = fakeServer({ "tickets.get": ticket() });
	const client = createClient({
		url: "http://127.0.0.1:4521",
		actor: "human:test",
		token: "test-desktop-token",
		attemptToken: "test-attempt-token",
		fetch: server.fetch,
		signal: new AbortController().signal,
		apiVersion,
	});
	await client.tickets.get({ ticket: "CDE-1" });
	expect(server.calls[0]!.request.headers.get("authorization")).toBe("Bearer test-desktop-token");
	expect(server.calls[0]!.request.headers.get("x-trellis-attempt")).toBe("test-attempt-token");
});
