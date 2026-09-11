import { describe, expect, test } from "bun:test";
import { SettingsSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server settings", () => {
	// WS-131
	test("settings round-trip through set and get", async () => {
		const server = createFakeServer();
		const settings = SettingsSchema.parse(await server.client.settings.get());
		expect(settings.stalledHours).toBe(24);
		expect(settings.defaultActorName).toBe("navid");
		const changed = await server.client.settings.set({ ...settings, stalledHours: 48 });
		expect(changed).toEqual({ ...settings, stalledHours: 48 });
		expect((await server.client.settings.get()).stalledHours).toBe(48);
		const response = await server.app.request("/api/settings", {
			method: "PUT",
			headers: { "content-type": "application/json", "x-trellis-actor": "human:navid" },
			body: JSON.stringify({ ...settings, stalledHours: 12 }),
		});
		expect(response.status).toBe(200);
		expect((await server.client.settings.get()).stalledHours).toBe(12);
	});
});
