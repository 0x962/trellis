import { createFakeServer, type FakeServer, type FakeServerOptions } from "../../web/test/fake-server";
import { queryClient } from "../src/lib/queryClient";
import { keys, store } from "../src/lib/store";

export type { FakeServer } from "../../web/test/fake-server";

// The URL the app stores for the fake server. The Hono app reads the path
// only, so no socket opens.
export const serverUrl = "http://trellis.local";

export const actorName = "navid";

const realFetch = globalThis.fetch;

// Starts one in-memory trellis server and points the app at it. The stored
// URL and name pass the setup guard, so the tabs render, and every request
// of the app reaches this server through `globalThis.fetch`.
export const startFakeServer = (options: FakeServerOptions = {}): FakeServer => {
	const server = createFakeServer(options);
	store.set(keys.serverUrl, serverUrl);
	store.set(keys.actorName, actorName);
	globalThis.fetch = server.fetch as unknown as typeof fetch;
	return server;
};

// Closes the event stream, restores the real fetch, and empties the query
// cache the app shares between tests.
export const stopFakeServer = (server: FakeServer) => {
	server.shutdown();
	globalThis.fetch = realFetch;
	queryClient.clear();
};

// The recorded calls to one procedure, such as "tickets.list".
export const callsTo = (server: FakeServer, path: string) =>
	server.calls.filter((call) => call.path.join(".") === path);

// The inputs of those calls, as the client sent them.
export const inputsTo = (server: FakeServer, path: string) => callsTo(server, path).map((call) => call.input);
