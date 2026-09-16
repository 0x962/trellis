import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
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
	await t.seedProject("OPS");
});
afterAll(() => h.close());
afterEach(() => t.close());

describe("label groups", () => {
	test("the API creates and lists a group and its labels", async () => {
		const group = await t.api("/api/projects/CDE/label-groups", { method: "POST", body: { name: "Type" } });
		expect(group.status).toBe(201);
		expect(group.headers.get("location")).toBe(`/api/projects/CDE/label-groups/${group.body.id}`);

		const label = await t.api(`/api/projects/CDE/label-groups/${group.body.id}/labels`, {
			method: "POST",
			body: { name: "Bug", color: "danger" },
		});
		expect(label.status).toBe(201);
		expect(label.headers.get("location")).toBe(
			`/api/projects/CDE/label-groups/${group.body.id}/labels/${label.body.id}`,
		);

		const listed = await t.api("/api/projects/CDE/label-groups");
		expect(listed.status).toBe(200);
		expect(listed.body.groups).toEqual([{ ...group.body, labels: [label.body] }]);
	});

	test("a project route rejects a group from another project", async () => {
		const group = await t.api("/api/projects/CDE/label-groups", { method: "POST", body: { name: "Type" } });
		const response = await t.api(`/api/projects/OPS/label-groups/${group.body.id}/labels`, {
			method: "POST",
			body: { name: "Bug" },
		});
		expect(response.status).toBe(404);
		expect(response.body).toMatchObject({ code: "NOT_FOUND", data: { kind: "label group", ref: group.body.id } });
	});
});
