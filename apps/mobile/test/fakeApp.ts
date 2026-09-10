import { createMMKV } from "react-native-mmkv";
import { createFakeServer, type FakeServer } from "../../web/test/fake-server";

export const serverUrl = "http://h:4521";

// The gate between the route and the fake server. Every request the typed
// client makes goes through the global fetch, and the fake server answers
// it over `app.request`. `hold` keeps every request to one procedure waiting
// until the returned function runs, so a test can read the screen between
// a press and the response. `callsTo` lists the recorded calls of one
// procedure, in order.
export type FakeApp = {
	server: FakeServer;
	hold: (procedure: string) => () => void;
	callsTo: (procedure: string) => FakeServer["calls"];
};

export const installFakeApp = (): FakeApp => {
	const server = createFakeServer();
	const store = createMMKV();
	store.set("trellis-server-url", serverUrl);
	store.set("trellis-actor-name", "navid");
	const holds = new Map<string, Promise<void>>();
	globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const held = holds.get(new URL(request.url).pathname);
		if (held !== undefined) await held;
		return server.app.request(request);
	}) as typeof fetch;
	const hold = (procedure: string) => {
		const path = `/rpc/${procedure.replaceAll(".", "/")}`;
		let release = () => {};
		holds.set(
			path,
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		return () => {
			holds.delete(path);
			release();
		};
	};
	const callsTo = (procedure: string) => server.calls.filter((call) => call.path.join(".") === procedure);
	return { server, hold, callsTo };
};
