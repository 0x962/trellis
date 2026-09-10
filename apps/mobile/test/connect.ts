import { createMMKV } from "react-native-mmkv";
import { actorName, type FakeServer, serverUrl } from "./fakeServer";

const store = createMMKV();
const realFetch = globalThis.fetch;

// Seeds MMKV with the server URL and the name. The returned function
// restores the global fetch.
export const connect = (server: FakeServer) => {
	store.set("trellis-server-url", serverUrl);
	store.set("trellis-actor-name", actorName);
	globalThis.fetch = ((input: Request, init?: RequestInit) =>
		server.app.request(input, init as never)) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
};

// A stored server that no socket answers: every request rejects the way a
// closed port does.
export const disconnect = () => {
	store.set("trellis-server-url", serverUrl);
	store.set("trellis-actor-name", actorName);
	globalThis.fetch = (() => Promise.reject(new TypeError("Network request failed"))) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
};

// A stored server whose requests never settle.
export const hang = () => {
	store.set("trellis-server-url", serverUrl);
	store.set("trellis-actor-name", actorName);
	globalThis.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
};

const pathOf = (input: Request | string) => new URL(typeof input === "string" ? input : input.url).pathname;

// Holds every request to one RPC procedure until `release` runs. The other
// requests pass through. `held` counts the requests that wait.
export const holdCalls = (procedure: string) => {
	const forward = globalThis.fetch;
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const state = { held: 0 };
	globalThis.fetch = (async (input: Request, init?: RequestInit) => {
		if (pathOf(input).endsWith(`/rpc/${procedure.replace(".", "/")}`)) {
			state.held += 1;
			await gate;
		}
		return forward(input, init);
	}) as unknown as typeof fetch;
	return { release: () => release(), state };
};

// Answers every request to one RPC procedure with a 500, so the client sees
// an undefined error. The other requests pass through.
export const failCalls = (procedure: string) => {
	const forward = globalThis.fetch;
	globalThis.fetch = (async (input: Request, init?: RequestInit) => {
		if (pathOf(input).endsWith(`/rpc/${procedure.replace(".", "/")}`)) {
			return new Response(JSON.stringify({ json: { code: "INTERNAL_SERVER_ERROR", status: 500, message: "boom" } }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		}
		return forward(input, init);
	}) as unknown as typeof fetch;
};
