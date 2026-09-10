import { describe, expect, test } from "bun:test";
import cliPkg from "../package.json";
import { lines, runCli } from "../test/deps.ts";
import { apiVersion, fakeServer, refusedFetch } from "../test/fakeServer.ts";
import { ticket } from "../test/fixtures.ts";
import { createClient } from "./client.ts";

// `createClient` builds the typed RPC client over `deps.fetch`. `apiVersion`
// is the version the CLI was built against; the client compares it with the
// server's `x-trellis-api-version` on every answer.
const url = "http://127.0.0.1:4521";

// `signal` fires on Ctrl-C and never fires in a test.
const client = (server: ReturnType<typeof fakeServer>, session?: string, version = apiVersion) =>
	createClient({
		url,
		actor: "agent:claude-code",
		session,
		fetch: server.fetch,
		signal: new AbortController().signal,
		apiVersion: version,
	});

describe("headers", () => {
	// CLI-33
	test("the client sends the three trellis headers", async () => {
		const server = fakeServer({ "tickets.get": ticket() });
		await client(server, "session_abc").tickets.get({ ticket: "CDE-1" });
		const request = server.calls[0]!.request;
		expect(request.method).toBe("POST");
		expect(request.url).toBe(`${url}/rpc/tickets/get`);
		expect(request.headers.get("x-trellis-actor")).toBe("agent:claude-code");
		expect(request.headers.get("x-trellis-session")).toBe("session_abc");
		expect(request.headers.get("x-trellis-client")).toBe(`cli/${cliPkg.version}`);
	});

	// CLI-34
	test("no session means no session header", async () => {
		const server = fakeServer({ "tickets.get": ticket() });
		await client(server).tickets.get({ ticket: "CDE-1" });
		expect(server.calls[0]!.request.headers.get("x-trellis-session")).toBeNull();
	});
});

describe("the api version", () => {
	// CLI-35
	test("an equal api version passes", async () => {
		const server = fakeServer({ "tickets.get": ticket() }, { serverApiVersion: apiVersion });
		expect(await client(server).tickets.get({ ticket: "CDE-1" })).toEqual(ticket());
	});

	// CLI-36
	test("an older server exits 7", async () => {
		const result = await runCli(
			["show", "CDE-1"],
			{ "tickets.get": ticket() },
			{ apiVersion: "1.2.0", serverApiVersion: "1.1.9" },
		);
		expect(result.code).toBe(7);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("1.2.0");
		expect(result.stderr).toContain("1.1.9");
		expect(result.stderr).toContain("older");
		expect(result.stdout).toBe("");
	});

	// CLI-37
	test("a newer server passes", async () => {
		const server = fakeServer({ "tickets.get": ticket() }, { serverApiVersion: "9.9.9" });
		expect(await client(server).tickets.get({ ticket: "CDE-1" })).toEqual(ticket());
	});
});

describe("an unreachable server", () => {
	const message =
		'error: trellis server not running at http://127.0.0.1:4521; run "trellis install" or "bun dev" (UNREACHABLE)';

	// CLI-38
	test("an unreachable server exits 5 and names trellis install and bun dev", async () => {
		const result = await runCli(["show", "CDE-1", "--url", "http://127.0.0.1:4521"], {}, { fetch: refusedFetch });
		expect(result.code).toBe(5);
		expect(result.stderr).toBe(`${message}\n`);
		expect(result.stdout).toBe("");
	});

	// CLI-39: another program on the port answers 200 without the header.
	test("a response without the api version header counts as unreachable", async () => {
		const result = await runCli(["show", "CDE-1"], { "tickets.get": ticket() }, { serverApiVersion: null });
		expect(result.code).toBe(5);
		expect(result.stderr).toBe(`${message}\n`);
	});
});
