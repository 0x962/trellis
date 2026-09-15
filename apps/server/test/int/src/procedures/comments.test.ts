import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

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

const managerId = "01M2HGY58VB4J2AYRVGDFHHB3P";
const managerActor = { name: managerId, kind: "agent", displayName: "Hana" };

const seedStoppedManager = () =>
	t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs
			(id, name, persona_name, kind, instruction, project_path, closed_at, created_at, updated_at)
			VALUES (${managerId}, 'Hana', 'Manager', 'manager', 'Manage', 'CDE', now(), now(), now())`);
	});

test("historical timeline actors expose a stopped manager name and retain their identity", async () => {
	const created = await t.api("/api/tickets/CDE-1/comments", {
		method: "POST",
		actor: `agent:${managerId}`,
		body: { body: "Ready for review." },
	});
	expect(created.status).toBe(201);
	await seedStoppedManager();
	const timeline = await t.api("/api/tickets/CDE-1/timeline");
	const managerItems = timeline.body.items.filter((item: { actor: { name: string } }) => item.actor.name === managerId);
	expect(managerItems).toHaveLength(2);
	for (const item of managerItems) expect(item.actor).toEqual(managerActor);
	await t.serverTx(async (tx) => {
		const stored = await tx.execute(sql`SELECT actor_name, actor_kind FROM comments WHERE id = ${created.body.id}`);
		expect(stored.rows).toEqual([{ actor_name: managerId, actor_kind: "agent" }]);
		await assertStatusInvariant(tx);
	});
});

test("comment create, update, thread, and resolve return the manager display name", async () => {
	await seedStoppedManager();
	const actor = `agent:${managerId}`;
	const created = await t.api("/api/tickets/CDE-1/comments", { method: "POST", actor, body: { body: "Question" } });
	expect(created.status).toBe(201);
	expect(created.body.actor).toEqual(managerActor);
	const reply = await t.api("/api/tickets/CDE-1/comments", {
		method: "POST",
		actor,
		body: { body: "Answer", parentId: created.body.id },
	});
	expect(reply.body.actor).toEqual(managerActor);
	const updated = await t.api(`/api/comments/${reply.body.id}`, { method: "PATCH", body: { body: "Final answer" } });
	expect(updated.body.actor).toEqual(managerActor);
	const thread = await t.api(`/api/comments/${reply.body.id}/thread`);
	expect(thread.body.root.actor).toEqual(managerActor);
	expect(thread.body.replies.map((item: { actor: unknown }) => item.actor)).toEqual([managerActor]);
	const resolved = await t.api(`/api/comments/${reply.body.id}/resolve`, { method: "POST", body: { resolved: true } });
	expect(resolved.body.actor).toEqual(managerActor);
	const unchanged = await t.api(`/api/comments/${created.body.id}/resolve`, {
		method: "POST",
		body: { resolved: true },
	});
	expect(unchanged.body.actor).toEqual(managerActor);
	await t.serverTx((tx) => assertStatusInvariant(tx));
});

test("human identities and external agent names retain their names without a display name", async () => {
	await seedStoppedManager();
	for (const actor of [
		{ kind: "human", name: managerId },
		{ kind: "agent", name: "external-reviewer" },
	]) {
		const created = await t.api("/api/tickets/CDE-1/comments", {
			method: "POST",
			actor: `${actor.kind}:${actor.name}`,
			body: { body: "Context" },
		});
		expect(created.status).toBe(201);
		expect(created.body.actor).toEqual(actor);
		const timeline = await t.api("/api/tickets/CDE-1/timeline");
		const matching = timeline.body.items.filter((item: { actor: { name: string } }) => item.actor.name === actor.name);
		expect(matching).toHaveLength(2);
		for (const item of matching) expect(item.actor).toEqual(actor);
	}
	await t.serverTx((tx) => assertStatusInvariant(tx));
});
