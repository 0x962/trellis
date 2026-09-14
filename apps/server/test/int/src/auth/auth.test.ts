import { afterEach, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

let t: TestApp;
afterEach(async () => {
	await t?.close();
});

test("a desktop host requires its bearer token on every route", async () => {
	t = await createTestApp({ authToken: "test-host-secret" });
	for (const path of ["/", "/api/health", "/api/events", "/rpc/system/health"]) {
		expect((await t.app.request(path)).status).toBe(401);
		expect((await t.app.request(path, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
	}
	expect((await t.app.request("/api/health", { headers: { authorization: "Bearer test-host-secret" } })).status).toBe(
		200,
	);
});

test("a foreign browser origin cannot use a desktop token", async () => {
	t = await createTestApp({ authToken: "test-host-secret" });
	const headers = { authorization: "Bearer test-host-secret", origin: "https://example.com" };
	expect((await t.app.request("http://127.0.0.1:4521/api/health", { headers })).status).toBe(403);
	headers.origin = "http://127.0.0.1:4521";
	expect((await t.app.request("http://127.0.0.1:4521/api/health", { headers })).status).toBe(200);
});

test("an existing host without a configured token retains its access contract", async () => {
	t = await createTestApp();
	expect((await t.app.request("/api/health")).status).toBe(200);
});
