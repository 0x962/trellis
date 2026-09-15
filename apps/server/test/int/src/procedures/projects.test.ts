import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

// The project procedures over /api: the flat list, the tree view of one
// project, and every mutation with its status code, its Location header,
// and its error code.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
});
afterAll(() => h.close());
afterEach(() => t.close());

const SUMMARY_KEYS = [
	"id",
	"parentId",
	"rootId",
	"key",
	"slug",
	"path",
	"name",
	"depth",
	"position",
	"openCount",
	"archivedAt",
];

const createSub = async (parent: string, name: string, slug?: string) => {
	const response = await t.api("/api/projects", { method: "POST", body: { parent, name, slug } });
	expect(response.status).toBe(201);
	return response.body;
};

describe("projects.list", () => {
	test("projects.list returns the flat project shape", async () => {
		await t.seedProject("CDE");
		await createSub("CDE", "Web");

		const response = await t.api("/api/projects");

		expect(response.status).toBe(200);
		expect(Array.isArray(response.body)).toBe(true);
		expect(response.body).toHaveLength(2);
		for (const item of response.body) {
			expect(Object.keys(item).sort()).toEqual([...SUMMARY_KEYS].sort());
		}
		expect(response.body.map((item: { path: string }) => item.path)).toEqual(["CDE", "CDE.web"]);
	});

	test("projects.list filters on the archived flag", async () => {
		await t.seedProject("CDE");
		await t.seedProject("OLD", "Old");
		const archived = await t.api("/api/projects/OLD", { method: "PATCH", body: { archived: true } });
		expect(archived.status).toBe(200);

		const active = await t.api("/api/projects?archived=false");

		expect(active.status).toBe(200);
		expect(active.body.map((item: { key: string }) => item.key)).toEqual(["CDE"]);
	});
});

describe("projects.get", () => {
	test("projects.get resolves every ProjectRef form", async () => {
		const root = await t.seedProject("CDE");
		const web = await createSub("CDE", "Web");
		const auth = await createSub("CDE.web", "Auth");

		const byPath = await t.api("/api/projects/CDE.web.auth");
		const byUlid = await t.api(`/api/projects/${auth.id}`);
		const byLower = await t.api("/api/projects/cde.web.auth");

		expect(byPath.status).toBe(200);
		expect(byUlid.body).toEqual(byPath.body);
		expect(byLower.body).toEqual(byPath.body);
		expect(byPath.body.ancestors.map((item: { id: string }) => item.id)).toEqual([root.id, web.id]);
		expect(byPath.body.children).toEqual([]);
		expect(byPath.body.repos).toEqual([]);
		expect(byPath.body.statuses).toHaveLength(6);
		expect(byPath.body.statusesInheritedFrom).toBe(root.id);
		expect(byPath.body.ticketTemplate).toBe("");
	});

	test("an unknown project ref answers NOT_FOUND with the kind and the ref", async () => {
		const response = await t.api("/api/projects/NOPE");

		expect(response.status).toBe(404);
		expect(response.body.code).toBe("NOT_FOUND");
		expect(response.body.data).toEqual({ kind: "project", ref: "NOPE" });
	});
});

describe("projects mutations", () => {
	test("projects.create answers 201 with a Location header", async () => {
		const response = await t.api("/api/projects", { method: "POST", body: { key: "CDE", name: "Code" } });

		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe("/api/projects/CDE");
		expect(response.body).toMatchObject({ key: "CDE", name: "Code", path: "CDE", depth: 0 });
		expect(response.body.statuses).toHaveLength(6);
	});

	test("projects.create refuses a key with a parent and a root without a key", async () => {
		await t.seedProject("CDE");

		const both = await t.api("/api/projects", { method: "POST", body: { key: "WEB", parent: "CDE", name: "Web" } });
		const neither = await t.api("/api/projects", { method: "POST", body: { name: "Web" } });

		expect(both.status).toBe(400);
		expect(both.body.code).toBe("INPUT_VALIDATION_FAILED");
		expect(neither.status).toBe(400);
		expect(neither.body.code).toBe("INPUT_VALIDATION_FAILED");
	});

	test("projects.create and projects.update answer 409 DUPLICATE on name for a name an active root holds", async () => {
		await t.seedProject("CDE", "Code");
		await t.seedProject("OPS", "Operations");

		const created = await t.api("/api/projects", { method: "POST", body: { key: "COD", name: "code" } });
		const renamed = await t.api("/api/projects/OPS", { method: "PATCH", body: { name: "CODE" } });

		for (const response of [created, renamed]) {
			expect(response.status).toBe(409);
			expect(response.body.code).toBe("DUPLICATE");
			expect(response.body.data).toEqual({ field: "name" });
		}
	});

	test("projects.update answers 200 with the changed project", async () => {
		await t.seedProject("CDE");

		const response = await t.api("/api/projects/CDE", { method: "PATCH", body: { name: "Code, renamed" } });

		expect(response.status).toBe(200);
		expect(response.body.name).toBe("Code, renamed");
		expect(response.body.key).toBe("CDE");
	});

	test("projects.move re-parents and reorders", async () => {
		await t.seedProject("CDE");
		const web = await createSub("CDE", "Web");
		const api = await createSub("CDE", "Api");
		const auth = await createSub("CDE.web", "Auth");

		const response = await t.api(`/api/projects/${auth.id}/move`, {
			method: "POST",
			body: { parent: "CDE", after: "CDE.web" },
		});

		expect(response.status).toBe(200);
		expect(response.body.parentId).toBe(web.parentId);
		expect(response.body.path).toBe("CDE.auth");
		const list = await t.api("/api/projects");
		const order = list.body
			.filter((item: { depth: number }) => item.depth === 1)
			.map((item: { id: string }) => item.id);
		expect(order).toEqual([web.id, auth.id, api.id]);
	});

	test("projects.delete works without a request body", async () => {
		await t.seedProject("CDE");
		await createSub("CDE", "Web");

		const response = await t.api("/api/projects/CDE.web", { method: "DELETE" });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ deleted: "CDE.web" });
		expect((await t.api("/api/projects/CDE.web")).status).toBe(404);
	});

	test("projects.setRepos replaces the list and is idempotent", async () => {
		await t.seedProject("CDE");
		const repos = [
			{ owner: "acme", repo: "web" },
			{ owner: "acme", repo: "api" },
		];

		const first = await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos } });
		const second = await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos } });

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(first.body).toHaveLength(2);
		expect(second.body).toEqual(first.body);
		expect(first.body.map((row: { owner: string; repo: string }) => `${row.owner}/${row.repo}`).sort()).toEqual([
			"acme/api",
			"acme/web",
		]);
	});
});
