import { expect, test } from "bun:test";
import type { BackupOutput } from "@trellis/api";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import { createBus } from "../../events/bus";
import { createGhRunner } from "../../gh/run";
import { createLogger } from "../../log";

function fixture(backup: () => Promise<BackupOutput>) {
	return createApp({
		config: loadConfig({ TRELLIS_AUTH_TOKEN: "fixture" }),
		pairedBackup: backup,
		transport: {
			call: async () => {
				throw new Error("legacy_snapshot_called");
			},
			start: async () => ({ applied: 0, liveShas: [] }),
			close: async () => {},
		},
		bus: createBus({ bootId: "backup" }),
		log: createLogger({ level: "error", env: {}, sink: { isTTY: false, write: () => {} } }),
		runtime: {
			version: "test",
			bootId: "backup",
			gh: createGhRunner(),
			ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: null }),
			addresses: async () => [],
		},
	});
}

test("the authenticated backup route awaits the paired archive result", async () => {
	const entered = Promise.withResolvers<void>();
	const finished = Promise.withResolvers<BackupOutput>();
	let calls = 0;
	const f = fixture(async () => {
		calls++;
		entered.resolve();
		return finished.promise;
	});
	const headers = { authorization: "Bearer fixture", "x-trellis-actor": "human:fixture" };
	const path = "http://localhost/api/backup";
	expect((await f.app.request(path, { method: "POST" })).status).toBe(401);
	const noActor = await f.app.request(path, { method: "POST", headers: { authorization: headers.authorization } });
	expect(noActor.status).toBe(400);
	expect(calls).toBe(0);
	let returned = false;
	const work = f.app.request(path, { method: "POST", headers }).then((response) => {
		returned = true;
		return response;
	});
	await entered.promise;
	expect(returned).toBe(false);
	const output = { path: "/fixture/paired.tar.gz", bytes: 123 };
	finished.resolve(output);
	const response = await work;
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(output);
	expect(calls).toBe(1);
	await f.stopDocumentActions();
});

test("a failed paired backup does not invoke the legacy snapshot path", async () => {
	let calls = 0;
	const f = fixture(async () => {
		calls++;
		throw new Error("capture_worker_response_unknown");
	});
	const response = await f.app.request("http://localhost/api/backup", {
		method: "POST",
		headers: { authorization: "Bearer fixture", "x-trellis-actor": "human:fixture" },
	});
	expect(response.status).toBe(500);
	expect(calls).toBe(1);
	await f.stopDocumentActions();
});
