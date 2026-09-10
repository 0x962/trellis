import { describe, expect, test } from "bun:test";
import { ActorSchema, DefaultActorSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server actors", () => {
	// WS-130
	test("actors.list and actors.default return the seeded identities", async () => {
		const server = createFakeServer();
		const actors = (await server.client.actors.list()).map((actor) => ActorSchema.parse(actor));
		expect(actors.map((actor) => `${actor.kind}:${actor.name}`).sort()).toEqual([
			"agent:claude-code",
			"agent:codex",
			"human:navid",
		]);
		for (const actor of actors) {
			expect(Number.isNaN(Date.parse(actor.firstSeenAt))).toBe(false);
			expect(actor.lastSeenAt >= actor.firstSeenAt).toBe(true);
		}
		expect(DefaultActorSchema.parse(await server.client.actors.default())).toEqual({
			name: "navid",
			kind: "human",
			stored: true,
		});
		const response = await server.app.request("/api/actors/default");
		expect(response.status).toBe(200);
	});

	// The seeded server is a machine someone set up; the empty one is a first
	// run, and a settings write stores the name.
	test("actors.default is stored after a settings write", async () => {
		const server = createFakeServer({ empty: true });
		expect((await server.client.actors.default()).stored).toBe(false);
		const settings = await server.client.settings.get();
		await server.client.settings.set({ ...settings, defaultActorName: "nk" });
		expect(await server.client.actors.default()).toEqual({ name: "nk", kind: "human", stored: true });
	});
});
