import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { signedInGh } from "../../../helpers/ctx.ts";

// GET /api/health, GET /api/gh, and POST /api/backup over the test app.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp({ ghStatus: signedInGh });
});
afterAll(() => t.close());

describe("system", () => {
	test("system.health returns the documented health shape", async () => {
		const response = await t.api("/api/health", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual([
			"addresses",
			"apiVersion",
			"bootId",
			"db",
			"gh",
			"ok",
			"rss",
			"version",
		]);
		expect(response.body.addresses).toEqual(await t.runtime.addresses());
		expect(response.body.ok).toBe(true);
		expect(response.body.version).toBe(t.runtime.version);
		expect(response.body.apiVersion).toMatch(/\S+/);
		expect(response.body.bootId).toBe(t.bootId);
		expect(response.body.rss).toBeGreaterThan(0);
		expect(response.body.db.ok).toBe(true);
		expect(response.body.db.sizeBytes).toBeGreaterThan(0);
		expect(response.body.gh).toEqual(signedInGh());
	});

	test("system.gh returns the gh state", async () => {
		const response = await t.api("/api/gh", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["checkedAt", "message", "ok", "reason", "user"]);
	});

	test("system.backup writes an archive under the data home", async () => {
		const response = await t.api("/api/backup", { method: "POST" });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["bytes", "path"]);
		expect(response.body.path).toStartWith(t.config.backupsDir);
		expect(existsSync(response.body.path)).toBe(true);
		expect(statSync(response.body.path).size).toBe(response.body.bytes);
	});
});
