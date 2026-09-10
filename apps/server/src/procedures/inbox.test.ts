import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { seedTicket } from "../../test/fixtures";
import { CLAUDE, createTestApp, statusIds, type TestApp } from "../../test/helpers/app.ts";

// GET /api/inbox answers the four Needs you sections, each with at most 100
// items and the whole count.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	const project = await t.seedProject("CDE");
	const ids = statusIds(project);
	for (let n = 1; n <= 120; n += 1) {
		await seedTicket(t.db, { projectId: project.id, rootId: project.id, statusId: ids.humanReview });
	}
	await t.createTicket({ project: "CDE", title: "Done by an agent", status: "in-progress" }, CLAUDE);
	const done = await t.api("/api/tickets/CDE-1/move", {
		method: "POST",
		body: { status: "done", force: true },
		actor: CLAUDE,
	});
	expect(done.status).toBe(200);
});
afterAll(() => t.close());

describe("inbox.get", () => {
	test("inbox.get returns the four sections capped at 100 items", async () => {
		const response = await t.api("/api/inbox?project=CDE", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["doneByAgentsToday", "failingCi", "review", "stalled"]);
		for (const name of ["review", "failingCi", "stalled", "doneByAgentsToday"]) {
			const section = response.body[name];
			expect(Object.keys(section).sort(), name).toEqual(["items", "total"]);
			expect(section.items.length, name).toBeLessThanOrEqual(100);
		}
		expect(response.body.review.total).toBe(120);
		expect(response.body.review.items).toHaveLength(100);
		expect(response.body.doneByAgentsToday.total).toBe(1);
		expect(response.body.doneByAgentsToday.items[0].identifier).toBe("CDE-1");
	});
});
