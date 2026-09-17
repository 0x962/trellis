import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { seedDefaultBuilder } from "../../../fixtures/projects.ts";
import { CLAUDE, createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

// The ticket writes over /api: create with its Location, update with
// expectedVersion and If-Match, move, the batches, delete, and the agent
// deletion rule. The reads live in tickets.read.test.ts.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	const project = await t.seedProject("CDE");
	await seedDefaultBuilder(h.db, project.id);
});
afterAll(() => h.close());
afterEach(() => t.close());

// A ticket CDE-1 at version 3: one create and two title changes.
const ticketAtVersionThree = async () => {
	await t.createTicket({ project: "CDE", title: "First" });
	for (const title of ["Second", "Third"]) {
		const response = await t.api("/api/tickets/CDE-1", { method: "PATCH", body: { title } });
		expect(response.status).toBe(200);
	}
	const current = await t.api("/api/tickets/CDE-1");
	expect(current.body.version).toBe(3);
	return current.body;
};

const patch = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
	t.api("/api/tickets/CDE-1", { method: "PATCH", body, headers });

describe("tickets.create and tickets.update", () => {
	test("tickets.create answers 201 with a Location header and the identifier", async () => {
		await t.createTicket({ project: "CDE", title: "First" });

		const response = await t.api("/api/tickets", { method: "POST", body: { project: "CDE", title: "Second" } });

		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe("/api/tickets/CDE-2");
		expect(response.body.identifier).toBe("CDE-2");
		expect(response.body.version).toBe(1);
	});

	test("a stale expectedVersion answers VERSION_CONFLICT with the current ticket", async () => {
		const current = await ticketAtVersionThree();

		const response = await patch({ title: "Stale", expectedVersion: 2 });

		expect(response.status).toBe(412);
		expect(response.body.code).toBe("VERSION_CONFLICT");
		expect(response.body.data.current).toEqual(current);
	});

	test("If-Match maps to expectedVersion and answers 412 on a mismatch", async () => {
		await ticketAtVersionThree();

		const response = await patch({ title: "Stale" }, { "if-match": '"2"' });

		expect(response.status).toBe(412);
		expect(response.body.code).toBe("VERSION_CONFLICT");
	});

	test("a matching If-Match lets the update through", async () => {
		await ticketAtVersionThree();

		const response = await patch({ title: "Fresh" }, { "if-match": '"3"' });

		expect(response.status).toBe(200);
		expect(response.body.title).toBe("Fresh");
		expect(response.body.version).toBe(4);
	});

	test("a disagreeing If-Match and expectedVersion answer INPUT_VALIDATION_FAILED", async () => {
		await ticketAtVersionThree();

		const response = await patch({ title: "Torn", expectedVersion: 2 }, { "if-match": '"3"' });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
		expect((await t.api("/api/tickets/CDE-1")).body.version).toBe(3);
	});
});

describe("tickets.move and the batches", () => {
	test("tickets.move places the ticket at the anchor", async () => {
		await t.createTicket({ project: "CDE", title: "Mover" });
		await t.createTicket({ project: "CDE", title: "Anchor", status: "in-progress" });
		await t.createTicket({ project: "CDE", title: "Last", status: "in-progress" });

		const response = await t.api("/api/tickets/CDE-1/move", {
			method: "POST",
			body: { status: "in-progress", after: "CDE-2" },
		});

		expect(response.status).toBe(200);
		expect(response.body.status.slug).toBe("in-progress");
		const column = await t.api("/api/tickets?status=in-progress&sort=position");
		expect(column.body.items.map((item: { identifier: string }) => item.identifier)).toEqual([
			"CDE-2",
			"CDE-1",
			"CDE-3",
		]);
	});

	test("tickets.updateMany changes every ref in one call", async () => {
		for (const title of ["One", "Two", "Three"]) await t.createTicket({ project: "CDE", title });

		const response = await t.api("/api/tickets/update-many", {
			method: "POST",
			body: { tickets: ["CDE-1", "CDE-2", "CDE-3"], priority: "high" },
		});

		expect(response.status).toBe(200);
		expect(response.body.items).toHaveLength(3);
		for (const identifier of ["CDE-1", "CDE-2", "CDE-3"]) {
			expect((await t.api(`/api/tickets/${identifier}`)).body.priority).toBe("high");
		}
	});

	test("a batch over 200 refs answers INPUT_VALIDATION_FAILED", async () => {
		const tickets = Array.from({ length: 201 }, (_, i) => `CDE-${i + 1}`);

		const response = await t.api("/api/tickets/update-many", { method: "POST", body: { tickets, priority: "low" } });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
	});

	test("tickets.deleteMany deletes every ref in one call", async () => {
		for (const title of ["One", "Two", "Three"]) await t.createTicket({ project: "CDE", title });

		const response = await t.api("/api/tickets/delete-many", {
			method: "POST",
			body: { tickets: ["CDE-1", "CDE-2", "CDE-3"] },
		});

		expect(response.status).toBe(200);
		expect(response.body.deleted.sort()).toEqual(["CDE-1", "CDE-2", "CDE-3"]);
		for (const identifier of ["CDE-1", "CDE-2", "CDE-3"]) {
			expect((await t.api(`/api/tickets/${identifier}`)).status).toBe(404);
		}
	});
});

describe("tickets.delete and the agent rules", () => {
	test("tickets.delete works without a request body", async () => {
		for (let n = 1; n <= 42; n += 1) await t.createTicket({ project: "CDE", title: `Ticket ${n}` });

		const response = await t.app.request("http://trellis.test/api/tickets/CDE-42", {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:dana" },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: "CDE-42" });
		expect((await t.api("/api/tickets/CDE-42")).status).toBe(404);
	});

	test.each([CLAUDE, "agent:manager"])("%s moves a ticket to done without force", async (actor) => {
		await t.createTicket({ project: "CDE", title: "Started", status: "in-progress" });

		const response = await t.api("/api/tickets/CDE-1/move", {
			method: "POST",
			body: { status: "done" },
			actor,
		});

		expect(response.status).toBe(200);
		expect(response.body.status).toMatchObject({ slug: "done", category: "done" });
		expect(response.body.completedAt).not.toBeNull();
		expect((await t.api("/api/tickets/CDE-1")).body.status.slug).toBe("done");
	});

	test("an agent deleting a ticket answers AGENT_CANNOT_DELETE", async () => {
		await t.createTicket({ project: "CDE", title: "Keep me" });

		const response = await t.api("/api/tickets/CDE-1", { method: "DELETE", actor: CLAUDE });

		expect(response.status).toBe(403);
		expect(response.body.code).toBe("AGENT_CANNOT_DELETE");
		expect((await t.api("/api/tickets/CDE-1")).status).toBe(200);
	});
});

test.each(["create", "move"])("an agent %s returns STATUS_FULL when In Progress is full", async (operation) => {
	await t.createTicket({ project: "CDE", title: "Current work", status: "in-progress" });
	await t.createTicket({ project: "CDE", title: "Waiting work" });
	await h.db.execute(sql`UPDATE statuses SET wip_limit=1 WHERE category='started'`);
	const response =
		operation === "create"
			? await t.api("/api/tickets", {
					method: "POST",
					actor: CLAUDE,
					body: { project: "CDE", title: "Extra work", status: "in-progress" },
				})
			: await t.api("/api/tickets/CDE-2/move", { method: "POST", actor: CLAUDE, body: { status: "in-progress" } });
	expect(response.status).toBe(409);
	expect(response.body.code).toBe("STATUS_FULL");
	expect(response.body.data).toMatchObject({ limit: 1, count: 1 });
});
