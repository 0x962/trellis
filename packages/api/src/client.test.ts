import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { z } from "zod";
import { ticket } from "../test/fixtures.ts";
import { createTrellisClient } from "./client.ts";

const baseUrl = "http://127.0.0.1:4521";

// The RPC link decodes a body of `{ json, meta }` in the RPC serializer's own
// encoding. The stub answers every request with `body` at `status` and keeps
// each Request so a test can read its URL and headers.
const rpcStub = (body: unknown, status = 200) => {
	const requests: Request[] = [];
	const serializer = new StandardRPCJsonSerializer();
	const fetchStub = async (request: Request) => {
		requests.push(request);
		const [json, meta] = serializer.serialize(body);
		return new Response(JSON.stringify({ json, meta }), { status, headers: { "content-type": "application/json" } });
	};
	return { requests, fetchStub };
};

describe("createTrellisClient", () => {
	test("createTrellisClient sends the actor and client headers to the rpc endpoint", async () => {
		const { requests, fetchStub } = rpcStub({ ok: true });
		const client = createTrellisClient(baseUrl, "agent:claude-code", fetchStub);
		await client.system.health();
		expect(requests).toHaveLength(1);
		const request = requests[0]!;
		expect(request.url).toStartWith(`${baseUrl}/rpc/`);
		expect(request.headers.get("x-trellis-actor")).toBe("agent:claude-code");
		expect(request.headers.get("x-trellis-client")).toMatch(/^api\/\d+\.\d+\.\d+$/);
	});

	test("createTrellisClient rejects an actor the header grammar rejects", () => {
		const { requests, fetchStub } = rpcStub({ ok: true });
		expect(() => createTrellisClient(baseUrl, "system:trellis", fetchStub)).toThrow(z.ZodError);
		expect(requests).toHaveLength(0);
	});

	test("the client surfaces a declared error as a typed defined error", async () => {
		const current = ticket();
		const { fetchStub } = rpcStub(
			{ defined: true, code: "VERSION_CONFLICT", status: 412, message: "The ticket changed.", data: { current } },
			412,
		);
		const client = createTrellisClient(baseUrl, "agent:claude-code", fetchStub);
		const { error } = await safe(client.tickets.update({ ticket: "CDE-42", title: "Renamed", expectedVersion: 2 }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "VERSION_CONFLICT") throw new Error("not the declared error");
		expect(error.status).toBe(412);
		expect(error.data.current).toEqual(current);
	});
});

// WS-16. The web batches the calls of one tick with a BatchLinkPlugin. The
// factory takes link plugins and keeps the two headers on every request.
describe("createTrellisClient plugins", () => {
	test("createTrellisClient accepts link plugins and keeps the actor and client headers", async () => {
		const { BatchLinkPlugin } = await import("@orpc/client/plugins");
		const { requests, fetchStub } = rpcStub({ ok: true });
		const plugin = new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }] });
		const client = createTrellisClient(baseUrl, "human:navid", fetchStub, { plugins: [plugin] });
		// The stub answers with a plain RPC body, not a batch body, so the
		// calls settle with an error. The request that went out is the proof.
		await Promise.allSettled([client.system.health(), client.system.gh()]);
		expect(requests).toHaveLength(1);
		const request = requests[0]!;
		expect(new URL(request.url).pathname).toBe("/rpc/__batch__");
		expect(request.headers.get("x-trellis-actor")).toBe("human:navid");
		expect(request.headers.get("x-trellis-client")).toMatch(/^api\/\d+\.\d+\.\d+$/);
	});
});
