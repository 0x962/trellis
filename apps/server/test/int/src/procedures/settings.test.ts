import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

// PUT /api/settings replaces the settings and GET /api/settings reads them.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

describe("settings", () => {
	test("settings round-trip through PUT and GET", async () => {
		const settings = {
			defaultActorName: "dana",
			stalledHours: 12,
			diffUrlTemplate: "{url}/files",
			agentLaunchCommand: "{{superset}} ws create --project {{projectId}} --name {{name}}",
		};

		const written = await t.api("/api/settings", { method: "PUT", body: settings });
		const read = await t.api("/api/settings", { actor: null });

		expect(written.status).toBe(200);
		expect(written.body).toEqual(settings);
		expect(read.status).toBe(200);
		expect(read.body).toEqual(settings);
	});

	test("settings reject a standalone hyphen in the launch command", async () => {
		const settings = await t.client.settings.get();
		const written = await t.api("/api/settings", {
			method: "PUT",
			body: {
				...settings,
				agentLaunchCommand:
					"{{superset}} ws create --project {{projectId}} --name {{ticket}} - {{name}} --command {{agentCommand}} --json",
			},
		});
		expect(written.status).toBe(400);
		expect(JSON.stringify(written.body)).toContain("standalone hyphen");
	});
});
