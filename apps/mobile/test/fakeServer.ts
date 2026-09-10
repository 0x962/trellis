import type { Call, FakeServer } from "../../web/test/fake-server";

export { createFakeServer, type FakeServer } from "../../web/test/fake-server";

// The stored server. The URL never reaches a socket: `connect` in
// ./connect.ts routes the global fetch into the fake server's Hono app,
// which reads the path only.
export const serverUrl = "http://192.168.1.20:4521";
export const serverHost = "192.168.1.20:4521";
export const actorName = "navid";

// The recorded calls to one procedure, such as "tickets.move".
export const callsTo = (server: FakeServer, procedure: string): Call[] =>
	server.calls.filter((call) => call.path.join(".") === procedure);

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
