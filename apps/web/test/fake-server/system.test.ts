import { describe, expect, test } from "bun:test";
import { HealthSchema, parseEventId } from "@trellis/api";
import { createFakeServer } from "./index";
import { openEvents } from "./sse";

describe("fake server system", () => {
	// WS-132. gh is never present on the fake server, so the settings page
	// can show the missing state.
	test("health reports the boot id and the api version", async () => {
		const server = createFakeServer();
		const response = await server.app.request("/api/health");
		expect(response.status).toBe(200);
		const health = HealthSchema.parse(await response.json());
		expect(health.ok).toBe(true);
		expect(health.bootId).toBe(server.bootId);
		expect(health.apiVersion).toBe(response.headers.get("x-trellis-api-version")!);
		expect(health.gh).toMatchObject({ ok: false, reason: "missing" });
		expect(health.db.ok).toBe(true);
		const stream = await openEvents(server.app);
		const ready = await stream.nextEvent();
		expect(parseEventId(ready!.id!).bootId).toBe(health.bootId);
		stream.close();
		expect(await server.client.system.health()).toMatchObject({ bootId: health.bootId });
	});
});
