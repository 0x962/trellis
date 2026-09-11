import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

// The comment procedures over /api: create with its Location, update, and a
// delete that takes no request body.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "First" });
});
afterAll(() => h.close());
afterEach(() => t.close());

describe("comments", () => {
	test("comments.create answers 201 with a Location header", async () => {
		const response = await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "Looks good." } });

		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe(`/api/comments/${response.body.id}`);
		expect(response.body.body).toBe("Looks good.");
		expect(response.body.actor).toEqual({ name: "dana", kind: "human" });
	});

	test("comments.update and comments.delete answer 200", async () => {
		const created = await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "Draft" } });
		const id = created.body.id as string;

		const updated = await t.api(`/api/comments/${id}`, { method: "PATCH", body: { body: "Final" } });
		const deleted = await t.app.request(`http://trellis.test/api/comments/${id}`, {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:dana" },
		});

		expect(updated.status).toBe(200);
		expect(updated.body.body).toBe("Final");
		expect(deleted.status).toBe(200);
		expect(await deleted.json()).toEqual({ deleted: id });
		const timeline = await t.api("/api/tickets/CDE-1/timeline");
		expect(timeline.body.items.filter((item: { kind: string }) => item.kind === "comment")).toEqual([]);
		expect((await t.api("/api/tickets/CDE-1")).body.commentCount).toBe(0);
	});
});

test("comment thread endpoints preserve replies, resolution, and delete protection", async () => {
	const root = await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "Question" } });
	const reply = await t.api("/api/tickets/CDE-1/comments", {
		method: "POST",
		body: { body: "Answer", parentId: root.body.id },
	});
	expect(reply.status).toBe(201);
	expect(reply.body.parentId).toBe(root.body.id);
	const thread = await t.api(`/api/comments/${reply.body.id}/thread`);
	expect(thread.status).toBe(200);
	expect(thread.body.root.id).toBe(root.body.id);
	expect(thread.body.replies).toHaveLength(1);
	const resolved = await t.api(`/api/comments/${root.body.id}/resolve`, { method: "POST", body: { resolved: true } });
	expect(resolved.status).toBe(200);
	expect(resolved.body.resolvedAt).not.toBeNull();
	const deleted = await t.api(`/api/comments/${root.body.id}`, { method: "DELETE" });
	expect(deleted.status).toBe(409);
	expect(deleted.body.code).toBe("COMMENT_HAS_REPLIES");
});
