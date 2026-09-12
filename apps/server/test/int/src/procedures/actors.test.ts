import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CLAUDE, createTestApp, type TestApp } from "../../../helpers/app.ts";

// GET /api/actors lists every actor a mutation has carried, and
// GET /api/actors/default answers the identity the web app starts with.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "By dana" });
	await t.createTicket({ project: "CDE", title: "By claude" }, CLAUDE);
});
afterAll(() => t.close());

describe("actors", () => {
	test("the actor routes return the seen actors and the default identity", async () => {
		const list = await t.api("/api/actors", { actor: null });
		const fallback = await t.api("/api/actors/default", { actor: null });

		expect(list.status).toBe(200);
		const seen = list.body.map((actor: { name: string; kind: string }) => `${actor.kind}:${actor.name}`).sort();
		expect(seen).toEqual(["agent:claude-code", "human:dana"]);
		for (const actor of list.body) {
			expect(Object.keys(actor).sort()).toEqual(["firstSeenAt", "kind", "lastSeenAt", "name"]);
			expect(Date.parse(actor.firstSeenAt)).toBeGreaterThan(0);
			expect(Date.parse(actor.lastSeenAt)).toBeGreaterThan(0);
		}
		expect(fallback.status).toBe(200);
		expect(Object.keys(fallback.body).sort()).toEqual(["kind", "name", "stored"]);
		expect(fallback.body.kind).toBe("human");
		expect(typeof fallback.body.name).toBe("string");
		expect(fallback.body.stored).toBe(false);
	});
});
