import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

// The status procedures over /api: the effective set of a project, and the
// create, update, reorder, delete, and clear mutations with their codes.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	const web = await t.api("/api/projects", { method: "POST", body: { parent: "CDE", name: "Web" } });
	expect(web.status).toBe(201);
});
afterAll(() => h.close());

const slugs = (body: { statuses: Array<{ slug: string }> }) => body.statuses.map((status) => status.slug);

const SEEDED = ["todo", "in-progress", "agent-review", "human-review", "done", "canceled"];

describe("statuses", () => {
	test("statuses.list returns the effective status set", async () => {
		const root = await t.api("/api/projects/CDE");

		const response = await t.api("/api/projects/CDE.web/statuses");

		expect(response.status).toBe(200);
		expect(slugs(response.body)).toEqual(SEEDED);
		expect(response.body.inheritedFrom).toBe(root.body.id);
		const positions = response.body.statuses.map((status: { position: number }) => status.position);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	test("statuses.create answers 201 with a Location header", async () => {
		const response = await t.api("/api/projects/CDE/statuses", {
			method: "POST",
			body: { name: "Blocked", category: "started" },
		});

		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe(`/api/projects/CDE/statuses/${response.body.id}`);
		expect(response.body).toMatchObject({ name: "Blocked", slug: "blocked", category: "started" });
	});

	test("statuses.update answers 200 with the changed status", async () => {
		const response = await t.api("/api/projects/CDE/statuses/in-progress", {
			method: "PATCH",
			body: { name: "Doing" },
		});

		expect(response.status).toBe(200);
		expect(response.body.name).toBe("Doing");
		expect(response.body.category).toBe("started");
	});

	test("statuses.reorder sets the full order", async () => {
		const before = await t.api("/api/projects/CDE/statuses");
		const ids = before.body.statuses.map((status: { id: string }) => status.id);
		const reversed = [...ids].reverse();

		const response = await t.api("/api/projects/CDE/statuses/order", { method: "PUT", body: { statuses: reversed } });

		expect(response.status).toBe(200);
		expect(response.body.statuses.map((status: { id: string }) => status.id)).toEqual(reversed);
		const after = await t.api("/api/projects/CDE/statuses");
		expect(after.body.statuses.map((status: { id: string }) => status.id)).toEqual(reversed);
	});

	test("statuses.delete without moveTo answers STATUS_IN_USE with the count", async () => {
		await t.createTicket({ project: "CDE", title: "One" });
		await t.createTicket({ project: "CDE", title: "Two" });

		const response = await t.api("/api/projects/CDE/statuses/todo", { method: "DELETE" });

		expect(response.status).toBe(409);
		expect(response.body.code).toBe("STATUS_IN_USE");
		expect(response.body.data).toEqual({ count: 2 });
	});

	test("statuses.delete with moveTo moves the tickets", async () => {
		await t.createTicket({ project: "CDE", title: "One" });
		await t.createTicket({ project: "CDE", title: "Two" });

		const response = await t.api("/api/projects/CDE/statuses/todo?moveTo=in-progress", { method: "DELETE" });

		expect(response.status).toBe(200);
		expect(response.body.moved).toBe(2);
		for (const identifier of ["CDE-1", "CDE-2"]) {
			const ticket = await t.api(`/api/tickets/${identifier}`);
			expect(ticket.body.status.slug).toBe("in-progress");
		}
	});

	test("statuses.clear refuses a root project", async () => {
		const response = await t.api("/api/projects/CDE/statuses", { method: "DELETE" });

		expect(response.status).toBe(409);
		expect(response.body.code).toBe("ROOT_STATUSES");
	});

	test("statuses.clear returns a sub-project to the inherited set", async () => {
		const root = await t.api("/api/projects/CDE");
		const own = await t.api("/api/projects/CDE.web/statuses", {
			method: "POST",
			body: { name: "Blocked", category: "started" },
		});
		expect(own.status).toBe(201);
		expect((await t.api("/api/projects/CDE.web/statuses")).body.inheritedFrom).toBeNull();

		const response = await t.api("/api/projects/CDE.web/statuses", { method: "DELETE" });

		expect(response.status).toBe(200);
		expect(response.body.inheritedFrom).toBe(root.body.id);
		const after = await t.api("/api/projects/CDE.web/statuses");
		expect(after.body.inheritedFrom).toBe(root.body.id);
		expect(slugs(after.body)).toEqual(SEEDED);
	});
});
