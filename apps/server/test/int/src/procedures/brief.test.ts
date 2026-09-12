import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

// GET /api/tickets/{ticket}/brief answers the markdown an agent starts from
// and the instant it was built.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "Add the brief", description: "Write the brief route." });
});
afterAll(() => t.close());

describe("brief.get", () => {
	test("brief.get returns the markdown and its timestamp", async () => {
		const response = await t.api("/api/tickets/CDE-1/brief", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["generatedAt", "markdown"]);
		expect(response.body.markdown).toContain("CDE-1");
		expect(response.body.markdown).toContain("Add the brief");
		expect(Date.parse(response.body.generatedAt)).toBeGreaterThan(0);
	});
});
