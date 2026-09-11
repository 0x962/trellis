import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

test("the server removes orchestration routes and OpenAPI operations", async () => {
	for (const [method, path] of [
		["GET", "/api/agents/settings"],
		["GET", "/api/agents/overview"],
		["POST", "/api/agents/manager/retry"],
		["GET", "/api/agents/sessions"],
		["GET", "/api/agents/runner-projects"],
		["POST", "/api/agents/inbox"],
		["POST", "/api/agents/register"],
		["POST", "/api/agents/builder"],
		["POST", "/api/agents/reviewer"],
		["POST", "/api/agents/wake"],
		["POST", "/api/agents/sessions/session-1/stop"],
		["PUT", "/api/agents/settings"],
	]) {
		const response = await t.api(path!, { method });
		expect(response.status).toBe(404);
	}
	for (const name of [
		"sessions",
		"inbox",
		"register",
		"startBuilder",
		"startReviewer",
		"stop",
		"wake",
		"settings",
		"setSettings",
		"runnerProjects",
		"retryManager",
		"overview",
	]) {
		const response = await t.api(`/rpc/agents/${name}`, { method: "POST", body: { json: {} } });
		expect(response.status).toBe(404);
	}
	const spec = await t.api("/api/openapi.json");
	expect(spec.status).toBe(200);
	expect(Object.keys(spec.body.paths).filter((path) => path.startsWith("/agents"))).toEqual([]);
	expect(spec.body.tags.filter((tag: { name: string }) => tag.name === "agents")).toEqual([]);
});
