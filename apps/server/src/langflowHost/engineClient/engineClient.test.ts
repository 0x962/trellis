import { expect, test } from "bun:test";
import { createEngineClient } from "./engineClient";

test("the client sends exact bytes and the private bearer", async () => {
	const requests: Request[] = [];
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:41234",
		authenticationFile: "/private/authentication",
		dependencies: {
			readAuthenticationFile: async (path) => {
				expect(path).toBe("/private/authentication");
				return "exact-private-bearer";
			},
			fetch: async (input, init) => {
				requests.push(new Request(input, init));
				return new Response('{"state":"found"}', {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	});
	const response = await client.request({
		method: "POST",
		path: "/trellis-v1/decisions/lookup",
		body: '{"executionId":"execution-1"}',
		capabilityId: "capability-1",
		signal: new AbortController().signal,
	});
	expect(response).toEqual({
		state: "received",
		status: 200,
		contentType: "application/json",
		bytes: new TextEncoder().encode('{"state":"found"}'),
	});
	expect(requests).toHaveLength(1);
	expect(requests[0]!.url).toBe("http://127.0.0.1:41234/trellis-v1/decisions/lookup");
	expect(requests[0]!.headers.get("Authorization")).toBe("Bearer exact-private-bearer");
	expect(requests[0]!.headers.get("X-Trellis-Capability-Id")).toBe("capability-1");
	expect(await requests[0]!.text()).toBe('{"executionId":"execution-1"}');
});

test("an uncertain mutation uses one read-only recovery lookup", async () => {
	const trace: string[] = [];
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:41234",
		authenticationFile: "/private/authentication",
		dependencies: {
			readAuthenticationFile: async () => "bearer",
			fetch: async () => new Response(),
		},
	});
	const result = await client.recoverMutation({
		lookup: async () => {
			trace.push("lookup");
			return trace.length === 1 ? { state: "absent" as const } : { state: "resolved" as const, value: "receipt" };
		},
		mutate: async () => {
			trace.push("mutate");
			return { state: "unknown" as const };
		},
	});
	expect(result).toEqual({ state: "resolved", value: "receipt", source: "recovery" });
	expect(trace).toEqual(["lookup", "mutate", "lookup"]);
});

test("the client rejects an endpoint outside private loopback", () => {
	expect(() =>
		createEngineClient({ endpoint: "http://localhost:41234", authenticationFile: "/private/authentication" }),
	).toThrow("sidecar_endpoint_not_private");
});
