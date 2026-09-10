import { describe, expect, test } from "bun:test";
import { ulidPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import {
	type ActorRef,
	claude,
	count,
	hoursAgo,
	navid,
	seedActors,
	seedComment,
	seedProject,
	seedRoot,
	seedStatuses,
	seedTicket,
} from "../../test/fixtures";
import { activityOf, expectErrorData, millis, query, ticketHarness, ticketRow } from "../../test/helpers/services.ts";
import * as comments from "./comments.ts";

const h = ticketHarness();

const create = (actor: ActorRef, input: Record<string, unknown>) =>
	h.as(actor)((ctx, tx) => comments.create(ctx, tx, input));

// A root with its six statuses and one ticket in Todo, last touched an hour ago.
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, updatedAt: hoursAgo(1) });
	return { rootId, statuses, id };
};

type CommentRow = { id: string; body: string; created_at: Date; updated_at: Date };

const commentRow = async (id: string) =>
	(await query<CommentRow>(h.db, sql`SELECT * FROM comments WHERE id = ${id}`))[0];

describe("comments", () => {
	test("a comment moves the ticket updated_at and bumps the version", async () => {
		const { id } = await seed();
		const { result: comment } = await create(claude, { ticket: id, body: "Started on it." });
		expect(comment).toMatchObject({ ticketId: id, body: "Started on it.", actor: { name: "claude", kind: "agent" } });
		expect(comment.id).toMatch(ulidPattern);
		expect(await count(h.db, "comments")).toBe(1);
		const row = (await ticketRow(h.db, id))!;
		expect(millis(row.updated_at)).toBeGreaterThan(hoursAgo(1).getTime());
		expect(row.version).toBe(2);
	});

	// The comment row names its actor, and the actors table must hold that
	// actor before the comment row. A new agent can make a comment its first
	// write.
	test("a comment can be the first write of a new actor", async () => {
		const { id } = await seed();
		const fresh: ActorRef = { kind: "agent", name: "fresh-agent" };
		const { result: comment } = await create(fresh, { ticket: id, body: "First words." });
		expect(comment).toMatchObject({ body: "First words.", actor: { name: "fresh-agent", kind: "agent" } });
		const found = await query<{ name: string }>(
			h.db,
			sql`SELECT name FROM actors WHERE name = 'fresh-agent' AND kind = 'agent'`,
		);
		expect(found).toHaveLength(1);
	});

	test("comments.create emits comment.created and ticket.updated", async () => {
		const { id } = await seed();
		const { result: comment, events } = await create(navid, { ticket: id, body: "Hello" });
		expect(events.map((event) => event.type).sort()).toEqual(["comment.created", "ticket.updated"]);
		const created = events.find((event) => event.type === "comment.created");
		expect(created).toMatchObject({ id: comment.id, ticketId: id });
		const updated = events.find((event) => event.type === "ticket.updated");
		expect(updated).toMatchObject({ summary: { id, version: 2, commentCount: 1 } });
	});

	test("comments.create writes the comment.created activity row", async () => {
		const { id } = await seed();
		const { result: comment } = await create(navid, { ticket: id, body: "Hello" });
		const rows = await activityOf(h.db, id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ action: "comment.created", actor_name: "navid", actor_kind: "human" });
		expect(rows[0]!.batch_id).toMatch(ulidPattern);
		expect(rows[0]!.meta).toMatchObject({ commentId: comment.id });
	});

	test("comments.update rewrites the body and writes activity", async () => {
		const { id } = await seed();
		const commentId = await seedComment(h.db, id, "Draft", navid, hoursAgo(1));
		const { result: comment, events } = await h.as(navid)((ctx, tx) =>
			comments.update(ctx, tx, { id: commentId, body: "Final" }),
		);
		expect(comment).toMatchObject({ id: commentId, body: "Final" });
		const row = (await commentRow(commentId))!;
		expect(row.body).toBe("Final");
		expect(millis(row.updated_at)).toBeGreaterThan(millis(row.created_at));
		const rows = await activityOf(h.db, id);
		expect(rows.map((activity) => activity.action)).toEqual(["comment.updated"]);
		expect(events.map((event) => event.type)).toContain("comment.updated");
	});

	test("comments.delete drops the row and lowers commentCount", async () => {
		const { id } = await seed();
		const gone = await seedComment(h.db, id, "one");
		await seedComment(h.db, id, "two");
		const { result, events } = await h.as(navid)((ctx, tx) => comments.delete(ctx, tx, { id: gone }));
		expect(result).toEqual({ deleted: gone });
		expect(await count(h.db, "comments")).toBe(1);
		const rows = await activityOf(h.db, id);
		expect(rows.map((activity) => activity.action)).toEqual(["comment.deleted"]);
		expect(events.map((event) => event.type).sort()).toEqual(["comment.deleted", "ticket.updated"]);
		const updated = events.find((event) => event.type === "ticket.updated");
		expect(updated).toMatchObject({ summary: { id, commentCount: 1 } });
	});

	test("a comment on an archived project throws PROJECT_ARCHIVED", async () => {
		await seedActors(h.db);
		const rootId = await seedRoot(h.db, "ARC", { archived_at: new Date() });
		const statuses = await seedStatuses(h.db, rootId);
		const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expectErrorData(create(navid, { ticket: id, body: "Hello" }), "PROJECT_ARCHIVED");
		expect(await count(h.db, "comments")).toBe(0);
	});

	test("comments.create with an unknown ticket throws NOT_FOUND", async () => {
		await seed();
		const data = await expectErrorData(create(navid, { ticket: "CDE-999", body: "Hello" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});

	test("comments.update with an unknown id throws NOT_FOUND", async () => {
		await seed();
		const missing = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
		const data = await expectErrorData(
			h.as(navid)((ctx, tx) => comments.update(ctx, tx, { id: missing, body: "Hello" })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "comment", ref: missing });
	});
});
