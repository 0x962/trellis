import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

// The static route serves the web dist: hashed assets immutable, index.html
// no-cache, and index.html for every app route. /api and /rpc never fall
// back to the SPA. Without a dist the route explains how to build one.

let withDist: TestApp;
let withoutDist: TestApp;
beforeAll(async () => {
	const dist = mkdtempSync(join(process.env.TRELLIS_HOME!, "web-dist-"));
	mkdirSync(join(dist, "assets"));
	writeFileSync(join(dist, "index.html"), '<!doctype html><html><body><div id="root"></div></body></html>\n');
	writeFileSync(join(dist, "assets", "app-3f9a2c1b.js"), "console.log('trellis');\n");
	withDist = await createTestApp({ webDist: dist });
	withoutDist = await createTestApp({ webDist: join(dist, "missing") });
});
afterAll(async () => {
	await withDist.close();
	await withoutDist.close();
});

const get = (t: TestApp, path: string) => t.app.request(`http://trellis.test${path}`);

describe("static route", () => {
	test("a hashed asset is served immutable", async () => {
		const response = await get(withDist, "/assets/app-3f9a2c1b.js");

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("immutable");
		expect(response.headers.get("content-type")).toContain("javascript");
		expect(await response.text()).toContain("trellis");
	});

	test("index.html is served no-cache", async () => {
		const response = await get(withDist, "/");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(await response.text()).toContain('<div id="root">');
	});

	test("a path with a malformed percent escape falls back to index.html", async () => {
		for (const path of ["/%E0%A4%A", "/t/%", "/assets/%ZZ.js"]) {
			const response = await get(withDist, path);

			expect(response.status, path).toBe(200);
			expect(response.headers.get("content-type"), path).toContain("text/html");
			expect(await response.text(), path).toContain('<div id="root">');
		}
	});

	test("an app route falls back to index.html", async () => {
		const response = await get(withDist, "/t/CDE-42");

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<div id="root">');
	});

	test("a missing web dist explains how to build", async () => {
		const response = await get(withoutDist, "/");

		expect(response.headers.get("content-type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("bun run build");
		expect(html).toContain("http://localhost:5173");
		expect(html.match(/<p[\s>]/g) ?? []).toHaveLength(1);
	});

	test("the api and rpc mounts never fall back to the SPA", async () => {
		const api = await get(withDist, "/api/nope");
		const rpc = await get(withDist, "/rpc/nope");

		expect(api.status).toBe(404);
		expect(rpc.status).toBe(404);
		expect(await api.text()).not.toContain('<div id="root">');
		expect(await rpc.text()).not.toContain('<div id="root">');
	});
});
