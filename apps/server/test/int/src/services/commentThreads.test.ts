import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dana, seedProject, seedTicket } from "../../../fixtures";
import { expectErrorData, ticketHarness } from "../../../helpers/services.ts";
import { timeline } from "../../../../src/db/queries/timeline.ts";
import { get as brief } from "../../../../src/services/brief.ts";
import * as comments from "../../../../src/services/comments.ts";

const h = ticketHarness();
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	return seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
};
const create = (ticket: string, body: string, parentId?: string) =>
	h.as(dana)((ctx, tx) => comments.create(ctx, tx, { ticket, body, parentId }));

describe("comment threads", () => {
	test("replies name their root and a thread read includes replies outside the timeline page", async () => {
		const ticket = await seed();
		const { result: root } = await create(ticket, "Question");
		const { result: reply, events } = await create(ticket, "Answer", root.id);
		const { result: nested } = await create(ticket, "Follow up", reply.id);
		expect(root).toMatchObject({ parentId: null, resolvedAt: null });
		expect(reply.parentId).toBe(root.id);
		expect(nested.parentId).toBe(root.id);
		expect(events).toContainEqual(expect.objectContaining({ type: "comment.created", id: reply.id, ticketId: ticket }));
		const { result: thread } = await h.as(dana)((ctx, tx) => comments.thread(ctx, tx, { id: nested.id }));
		expect(thread.root).toEqual(root);
		expect(thread.replies.map((item) => item.id).sort()).toEqual([reply.id, nested.id].sort());
		const page = await h.db.transaction((tx) => timeline(tx, { ticketId: ticket, limit: 1 }));
		expect(page.nextCursor).not.toBeNull();
		expect(page.items[0]).toMatchObject({ kind: "comment", parentId: root.id, resolvedAt: null });
		const activity = await h.db.execute(
			sql`SELECT meta FROM activity WHERE action = 'comment.created' ORDER BY id DESC LIMIT 1`,
		);
		expect(activity.rows[0]!.meta).toMatchObject({ commentId: nested.id, parentId: root.id, threadId: root.id });
	});

	test("a reply cannot name a comment from another ticket", async () => {
		const ticket = await seed();
		const { result: root } = await create(ticket, "Question");
		const [source] = (await h.db.execute(sql`SELECT project_id, root_id, status_id FROM tickets WHERE id = ${ticket}`))
			.rows;
		const other = await seedTicket(h.db, {
			projectId: source!.project_id as string,
			rootId: source!.root_id as string,
			statusId: source!.status_id as string,
		});
		await expectErrorData(create(other, "Wrong ticket", root.id), "COMMENT_PARENT_MISMATCH");
	});

	test("resolve and reopen update the root and emit its comment event", async () => {
		const ticket = await seed();
		const { result: root } = await create(ticket, "Question");
		const { result: reply } = await create(ticket, "Answer", root.id);
		const { result: resolved, events } = await h.as(dana)((ctx, tx) =>
			comments.resolve(ctx, tx, { id: reply.id, resolved: true }),
		);
		expect(resolved.id).toBe(root.id);
		expect(resolved.resolvedAt).not.toBeNull();
		expect(events).toContainEqual(expect.objectContaining({ type: "comment.updated", id: root.id, ticketId: ticket }));
		const { result: reopened } = await h.as(dana)((ctx, tx) =>
			comments.resolve(ctx, tx, { id: root.id, resolved: false }),
		);
		expect(reopened.resolvedAt).toBeNull();
	});

	test("a root with replies cannot be deleted, and a reply can be deleted", async () => {
		const ticket = await seed();
		const { result: root } = await create(ticket, "Question");
		const { result: reply } = await create(ticket, "Answer", root.id);
		await expectErrorData(
			h.as(dana)((ctx, tx) => comments.delete(ctx, tx, { id: root.id })),
			"COMMENT_HAS_REPLIES",
		);
		const { events } = await h.as(dana)((ctx, tx) => comments.delete(ctx, tx, { id: reply.id }));
		expect(events).toContainEqual(
			expect.objectContaining({ type: "ticket.updated", summary: expect.objectContaining({ commentCount: 1 }) }),
		);
		await h.as(dana)((ctx, tx) => comments.delete(ctx, tx, { id: root.id }));
	});

	test("archived projects allow thread reads and reject reply and resolve writes", async () => {
		const ticket = await seed();
		const { result: root } = await create(ticket, "Question");
		await h.db.execute(sql`UPDATE projects SET archived_at = now()`);
		await expectErrorData(create(ticket, "Answer", root.id), "PROJECT_ARCHIVED");
		await expectErrorData(
			h.as(dana)((ctx, tx) => comments.resolve(ctx, tx, { id: root.id, resolved: true })),
			"PROJECT_ARCHIVED",
		);
		const { result } = await h.as(dana)((ctx, tx) => comments.thread(ctx, tx, { id: root.id }));
		expect(result.root.id).toBe(root.id);
	});
});

test("a brief includes the root context of a recent reply outside its last ten comments", async () => {
	const ticket = await seed();
	const { result: root } = await create(ticket, "Original question");
	await h.db.execute(sql`UPDATE comments SET created_at = now() - interval '1 day' WHERE id = ${root.id}`);
	for (let i = 0; i < 11; i++) await create(ticket, `Other comment ${i}`);
	const { result: reply } = await create(ticket, "New answer", root.id);
	await h.db.execute(sql`UPDATE comments SET created_at = now() WHERE id = ${reply.id}`);
	const { result } = await h.as(dana)((ctx, tx) => brief(ctx, tx, { ticket }));
	expect(result.markdown).toContain(`reply to ${root.id}`);
	expect(result.markdown).toContain("Original question");
	expect(result.markdown).toContain(reply.id);
});
