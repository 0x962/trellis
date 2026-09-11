import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import * as kvStore from "../../test/mocks/expo-sqlite-kv-store";

mock.module("expo-sqlite/kv-store", () => kvStore);

const { getClient } = await import("./orpc");
const { store } = await import("./store");

const realFetch = globalThis.fetch;

// Replaces the global fetch with one that records every request and answers
// `{ ok: true }` in the RPC link's own encoding.
const recordFetch = () => {
	const requests: Request[] = [];
	const serializer = new StandardRPCJsonSerializer();
	globalThis.fetch = (async (input: Request) => {
		requests.push(input);
		const [json, meta] = serializer.serialize({ ok: true });
		return new Response(JSON.stringify({ json, meta }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return requests;
};

describe("getClient", () => {
	beforeEach(() => {
		store.clearAll();
		store.set("trellis-server-url", "http://h:4521");
		store.set("trellis-actor-name", "dana");
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("the client sends the stored URL and the actor header", async () => {
		const requests = recordFetch();
		const client = getClient();
		await client.system.health();
		expect(requests).toHaveLength(1);
		const request = requests[0]!;
		expect(request.url).toStartWith("http://h:4521/rpc");
		expect(request.headers.get("x-trellis-actor")).toBe("human:dana");
		expect(request.headers.get("x-trellis-client")).toMatch(/^api\//);

		expect(getClient()).toBe(client);
		store.set("trellis-actor-name", "other");
		const renamed = getClient();
		expect(renamed).not.toBe(client);
		expect(getClient()).toBe(renamed);
		store.set("trellis-server-url", "http://h:4522");
		expect(getClient()).not.toBe(renamed);
	});
});
