import { beforeEach, expect, test } from "bun:test";
import type { FetchLike } from "@trellis/api";

const memoryStorage = (entries: Map<string, string>): Storage => ({
	get length() {
		return entries.size;
	},
	clear: () => entries.clear(),
	getItem: (key: string) => entries.get(key) ?? null,
	key: (index: number) => [...entries.keys()][index] ?? null,
	removeItem: (key: string) => entries.delete(key),
	setItem: (key: string, value: string) => entries.set(key, value),
});

const stored = new Map<string, string>();
globalThis.localStorage = memoryStorage(stored);
// `createOrpc` reads `window.location.origin` while the module loads, and a
// test run has no browser. The two imports below wait for it.
globalThis.window = { location: { origin: "http://127.0.0.1:4521" } } as Window & typeof globalThis;

const { createOrpc } = await import("./orpc");
const { saveActorName } = await import("./identity");

const sent: Request[] = [];

// A host that refuses every write, as it does with a wrong host token or a
// browser origin that it does not serve.
const refuse: FetchLike = (request) => {
	sent.push(request);
	return new Response(
		JSON.stringify({ defined: false, code: "FORBIDDEN", status: 403, message: "This origin cannot access the host." }),
		{ status: 403, headers: { "content-type": "application/json" } },
	);
};

// A host that stores the settings it is sent.
const accept: FetchLike = (request) => {
	sent.push(request);
	return new Response(JSON.stringify({ json: { defaultActorName: "Navid" } }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
};

const context = (fetch: FetchLike) => {
	const clients = createOrpc({ fetch, baseUrl: "http://127.0.0.1:4521" });
	clients.queryClient.setQueryData(clients.orpc.settings.get.queryKey({}), { defaultActorName: "" });
	return clients;
};

beforeEach(() => {
	stored.clear();
	sent.length = 0;
});

test("a refused settings write leaves this browser with no name", async () => {
	const clients = context(refuse);

	await expect(saveActorName(clients, "Navid")).rejects.toThrow();

	expect(stored.size).toBe(0);
});

test("the refused write still carries the name, so the host reads who asked", async () => {
	const clients = context(refuse);

	await saveActorName(clients, "Navid").catch(() => {});

	expect(sent.at(-1)?.headers.get("x-trellis-actor")).toBe("human:Navid");
});

test("an accepted settings write stores the name in this browser", async () => {
	const clients = context(accept);

	await saveActorName(clients, "Navid");

	expect(stored.get("trellis.actor")).toBe(JSON.stringify({ name: "Navid", kind: "human" }));
});
