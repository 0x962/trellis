import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { buildOpenApiDocument } from "../../../../src/openapi.ts";

// /api/openapi.json serves the post-processed document and /api/docs renders
// it with Scalar. Neither needs the actor header.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

describe("docs routes", () => {
	test("the spec route serves the post-processed document", async () => {
		const response = await t.api("/api/openapi.json", { actor: null });

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("json");
		const { document } = await buildOpenApiDocument();
		expect(response.body).toEqual(JSON.parse(JSON.stringify(document)));
	});

	test("the docs route renders Scalar against the spec URL", async () => {
		const response = await t.api("/api/docs", { actor: null });

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(response.body).toMatch(/<html/i);
		expect(response.body).toMatch(/scalar/i);
		expect(response.body).toContain("/api/openapi.json");
	});
});
