import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

// GET /api/search answers tickets and projects that match `q`, each list
// within `limit`.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	await t.seedProject("CDE");
	await t.seedProject("OPS", "Operations");
	const dark = await t.api("/api/projects", { method: "POST", body: { parent: "CDE", name: "Dark theme" } });
	expect(dark.status).toBe(201);
	await t.createTicket({ project: "CDE", title: "Dark mode toggle" });
	await t.createTicket({ project: "CDE", title: "Dark mode on mobile" });
	await t.createTicket({ project: "OPS", title: "Dark launch" });
	await t.createTicket({ project: "CDE", title: "Light mode" });
});
afterAll(() => t.close());

describe("search.query", () => {
	test("search.query returns tickets and projects", async () => {
		const response = await t.api("/api/search?q=dark&project=CDE&limit=20", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["projects", "tickets"]);
		const tickets = response.body.tickets.map((item: { identifier: string }) => item.identifier).sort();
		expect(tickets).toEqual(["CDE-1", "CDE-2"]);
		expect(response.body.projects.map((item: { path: string }) => item.path)).toEqual(["CDE.dark-theme"]);
		expect(response.body.tickets.length).toBeLessThanOrEqual(20);
		expect(response.body.projects.length).toBeLessThanOrEqual(20);
	});
});
