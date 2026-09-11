import { queryClient } from "../src/lib/queryClient";
import { keys, store } from "../src/lib/store";
import { type Call, createFakeServer, type FakeServer, type FakeServerOptions } from "./fake-server";

export { createFakeServer, type FakeServer } from "./fake-server";

// The stored server. The URL never reaches a socket: `startFakeServer` and
// `connect` in ./connect.ts route the global fetch into the fake server's
// Hono app, which reads the path only.
export const serverUrl = "http://192.168.1.20:4521";
export const serverHost = "192.168.1.20:4521";
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

// The recorded calls to one procedure, such as "tickets.move".
export const callsTo = (server: FakeServer, procedure: string): Call[] =>
	server.calls.filter((call) => call.path.join(".") === procedure);

// The inputs of those calls, as the client sent them.
export const inputsTo = (server: FakeServer, procedure: string) => callsTo(server, procedure).map((call) => call.input);

// The procedures a read of the Needs you screen may call. Every other call
// is a write.
const reads = new Set([
	"inbox.get",
	"settings.get",
	"pullRequests.list",
	"tickets.counts",
	"tickets.get",
	"system.health",
]);

export const writes = (server: FakeServer): Call[] => server.calls.filter((call) => !reads.has(call.path.join(".")));
