import { expect, test } from "bun:test";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import type { ServiceTransport } from "../../db/transport";
import { createBus } from "../../events/bus";
import { createGhRunner } from "../../gh/run";
import { createLogger } from "../../log";
import type { NativeReservationTransport } from "./langflow-native-reservations";

const path = "http://localhost/api/langflow-private/v1/native-reservations";
const requestBytes = '{ "version": 1, "instruction": "é\\n原文" }\n';
const handleBytes = '{ "version":1, "state":"reserved" }\n';
const headers = {
	authorization: "Bearer outgoing-instance-token",
	"x-trellis-capability-id": "saved-capability",
	"content-type": "application/json",
};

function fixture(nativeReservations?: NativeReservationTransport) {
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected start");
		},
		close: async () => {},
		call: async () => {
			throw new Error("Unexpected service call");
		},
	};
	return createApp({
		config: loadConfig({ TRELLIS_AUTH_TOKEN: "different-host-token" }),
		transport,
		bus: createBus({ bootId: "native-route" }),
		log: createLogger({ level: "error", env: {}, sink: { isTTY: false, write: () => {} } }),
		runtime: {
			version: "test",
			bootId: "native-route",
			gh: createGhRunner(),
			ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
			addresses: async () => [],
		},
		nativeReservations,
	}).app;
}

test("the mounted private route preserves bytes and passes the outgoing credential", async () => {
	const received: Parameters<NativeReservationTransport["reserve"]>[0][] = [];
	const app = fixture({
		reserve: async (input) => {
			received.push(input);
			return handleBytes;
		},
	});
	const response = await app.request(path, { method: "POST", headers, body: requestBytes });
	expect(response.status).toBe(200);
	expect(await response.text()).toBe(handleBytes);
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(received).toEqual([
		{
			authorization: headers.authorization,
			capabilityId: headers["x-trellis-capability-id"],
			requestBytes,
		},
	]);
});

test("the Host guard refuses before the native callback", async () => {
	let calls = 0;
	const app = fixture({
		reserve: async () => {
			calls++;
			return handleBytes;
		},
	});
	const response = await app.request(path, {
		method: "POST",
		headers: { ...headers, host: "foreign.invalid" },
		body: requestBytes,
	});
	expect(response.status).toBe(403);
	expect(calls).toBe(0);
});

test("missing credentials and malformed UTF-8 never reach the callback", async () => {
	let calls = 0;
	const app = fixture({
		reserve: async () => {
			calls++;
			return handleBytes;
		},
	});
	for (const [header, expected] of [
		["authorization", 401],
		["x-trellis-capability-id", 403],
	] as const) {
		const incomplete = new Headers(headers);
		incomplete.delete(header);
		const response = await app.request(path, { method: "POST", headers: incomplete, body: requestBytes });
		expect(response.status).toBe(expected);
	}
	const invalid = await app.request(path, { method: "POST", headers, body: new Uint8Array([0xff]) });
	expect(invalid.status).toBe(400);
	expect(calls).toBe(0);
});

test("absent configuration leaves the private route unavailable", async () => {
	const response = await fixture().request(path, {
		method: "POST",
		headers: { ...headers, authorization: "Bearer different-host-token" },
		body: requestBytes,
	});
	expect(response.status).toBe(404);
});

test("an unknown reservation failure remains an error response", async () => {
	const app = fixture({
		reserve: async () => {
			throw new Error("response_lost");
		},
	});
	const response = await app.request(path, { method: "POST", headers, body: requestBytes });
	expect(response.status).toBe(500);
	expect(await response.text()).not.toContain(handleBytes);
});
