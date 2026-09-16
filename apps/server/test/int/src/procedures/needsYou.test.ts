import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "Review", status: "human-review" });
});
afterEach(() => t.close());
afterAll(() => h.close());

test("inbox routes use the request actor and persist personal actions", async () => {
	const read = await t.api("/api/needs-you");
	expect(read.status).toBe(200);
	expect(read.headers.get("vary")).toContain("x-trellis-actor");
	expect(read.body.items).toHaveLength(1);
	const id = read.body.items[0].id;
	const ignored = await t.api(`/api/needs-you/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: { action: "ignore" },
	});
	expect(ignored.status).toBe(200);
	expect((await t.api("/api/needs-you/summary")).body.active).toBe(0);
	expect((await t.api("/api/needs-you/summary", { actor: "human:alex" })).body.active).toBe(1);
	const invalid = await t.api(`/api/needs-you/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: { action: "snooze", until: "2020-01-01T00:00:00.000Z" },
	});
	expect(invalid.status).toBe(400);
	const agent = await t.api("/api/needs-you", { actor: "agent:runner" });
	expect(agent.status).toBe(400);
	const anonymous = await t.api("/api/needs-you", { actor: null });
	expect(anonymous.status).toBe(400);
	const malformed = await t.api("/api/needs-you", { actor: "robot:runner" });
	expect(malformed.body.code).toBe("ACTOR_INVALID");
});
