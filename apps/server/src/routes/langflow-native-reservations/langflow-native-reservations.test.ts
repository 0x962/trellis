import { expect, test } from "bun:test";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import type { ServiceTransport } from "../../db/transport";
import { createBus } from "../../events/bus";
import { createGhRunner } from "../../gh/run";
import { nativeReservations } from "../../langflowBootstrap/nativeReservations";
import { supervisorFixture } from "../../langflowHost/fixtures/supervisorFixture";
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

test("the mounted route maps a real supervisor credential rejection to HTTP 401", async () => {
	const f = await supervisorFixture();
	const supervisor = await f.open();
	let connection: ReturnType<typeof nativeReservations> | undefined;
	let calls = 0;
	try {
		await supervisor.start();
		connection = nativeReservations({
			home: f.home,
			supervisor,
			transport: {
				start: async () => {
					throw new Error("Unexpected start");
				},
				close: async () => {},
				call: async () => {
					calls++;
					throw new Error("Worker access before authentication");
				},
			},
			archive: {
				readAuthorityBytes: () => {
					throw new Error("Engine authority access before authentication");
				},
			},
		});
		const app = fixture(connection.transport);
		const response = await app.request(path, {
			method: "POST",
			headers: { ...headers, authorization: "Bearer wrong" },
			body: requestBytes,
		});
		expect(response.status).toBe(401);
		expect(calls).toBe(0);
	} finally {
		await connection?.stop();
		await supervisor.shutdown();
		await f.remove();
	}
});

test("unrelated reservation failures remain HTTP 500", async () => {
	for (const message of ["response_lost", "unsafe_sidecar_authentication", "sidecar_authentication_digest_conflict"]) {
		const app = fixture({
			reserve: async () => {
				throw new Error(message);
			},
		});
		const response = await app.request(path, { method: "POST", headers, body: requestBytes });
		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain(handleBytes);
	}
});
