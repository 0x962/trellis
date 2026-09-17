import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { ServiceCtx as CoreCtx } from "../../../../src/context.ts";
import { type Tx, withTx } from "../../../../src/db/tx.ts";
import * as attachments from "../../../../src/services/attachments.ts";
import * as comments from "../../../../src/services/comments.ts";
import { claude, dana, hoursAgo, seedComment, seedProject, seedTicket } from "../../../fixtures";
import { eventSink, testCtx, withEmit } from "../../../helpers/ctx.ts";
import { freshHomeWithDirs } from "../../../helpers/home.ts";
import { expectErrorData, ticketHarness } from "../../../helpers/services.ts";

// An attachment names the comment it illustrates, and a comment carries
// its attachments. An upload can name the comment, or a comment can claim
// unlinked uploads of its ticket. A deleted comment takes its attachments
// with it and queues their blobs for removal.

const h = ticketHarness();

let home: string;
beforeEach(() => {
	home = freshHomeWithDirs();
});

const seedOneTicket = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	return seedTicket(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.todo,
		number: 1,
		updatedAt: hoursAgo(5),
	});
};

const png = (text: string, name = "shot.png") =>
	new File([new TextEncoder().encode(text)], name, { type: "image/png" });

// An upload runs on the io context, which carries the data home.
const upload = async (actor: typeof dana, input: { ticket: string; file: File; commentId?: string }) => {
	const handle = testCtx({ db: h.db, home, actor });
	const { delivered, sink } = eventSink();
	const { result } = await withTx(h.db, (tx, emit) => attachments.upload(withEmit(handle.ctx, emit), tx, input), sink);
	await handle.runAfterCommit();
	return { result, delivered };
};

// A comment runs on the request context, which carries the project cache.
const as = (actor: typeof dana) => h.as(actor);

const attachmentRows = async (ticketId: string) =>
	(await h.db.execute(sql`SELECT id, ticket_id, comment_id FROM attachments WHERE ticket_id = ${ticketId}`)).rows as {
		id: string;
		ticket_id: string;
		comment_id: string | null;
	}[];

describe("comment attachments", () => {
	test("comments.create links unlinked uploads and returns them", async () => {
		const ticket = await seedOneTicket();
		const { result: first } = await upload(dana, { ticket, file: png("first") });
		const { result: second } = await upload(dana, { ticket, file: png("second") });
		const { result: comment } = await as(dana)((ctx, tx) =>
			comments.create(ctx, tx, {
				ticket,
				body: "Two screens.",
				attachmentIds: [first.attachment.id, second.attachment.id],
			}),
		);
		expect(comment.attachments?.map((file) => file.filename)).toEqual(["shot.png", "shot.png"]);
		expect(comment.attachments?.map((file) => file.commentId)).toEqual([comment.id, comment.id]);
		for (const row of await attachmentRows(ticket)) expect(row.comment_id).toBe(comment.id);
	});

	test("the same deduplication key and the same files return the first comment", async () => {
		const ticket = await seedOneTicket();
		const { result: first } = await upload(dana, { ticket, file: png("first") });
		const { result: second } = await upload(dana, { ticket, file: png("second") });
		const input = {
			ticket,
			body: "Two screens.",
			attachmentIds: [first.attachment.id, second.attachment.id],
			dedupeKey: "release:revision-1",
		};
		const { result: created } = await as(dana)((ctx, tx) => comments.create(ctx, tx, input));
		// The retry names the same files in the other order. Both id lists sort
		// before they are compared, so the repeat answers with the first comment.
		const { result: repeated } = await as(dana)((ctx, tx) =>
			comments.create(ctx, tx, { ...input, attachmentIds: [second.attachment.id, first.attachment.id] }),
		);
		expect(repeated.id).toBe(created.id);
		expect(repeated.attachments?.map((file) => file.id).sort()).toEqual(
			[first.attachment.id, second.attachment.id].sort(),
		);
	});

	test("the same deduplication key with different files throws", async () => {
		const ticket = await seedOneTicket();
		const { result: first } = await upload(dana, { ticket, file: png("first") });
		const { result: second } = await upload(dana, { ticket, file: png("second") });
		const input = { ticket, body: "One screen.", dedupeKey: "release:revision-2" };
		await as(dana)((ctx, tx) => comments.create(ctx, tx, { ...input, attachmentIds: [first.attachment.id] }));
		await expect(
			as(dana)((ctx, tx) => comments.create(ctx, tx, { ...input, attachmentIds: [second.attachment.id] })),
		).rejects.toThrow();
	});

	test("comments.create with an attachment of another ticket throws", async () => {
		const ticket = await seedOneTicket();
		const { rootId, statuses } = await seedProject(h.db, "SEC");
		const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		const { result: uploaded } = await upload(dana, { ticket, file: png("x") });
		await expectErrorData(
			as(dana)((ctx, tx) =>
				comments.create(ctx, tx, { ticket: second, body: "Wrong ticket.", attachmentIds: [uploaded.attachment.id] }),
			),
			"COMMENT_ATTACHMENT_MISMATCH",
		);
		expect((await attachmentRows(ticket))[0]!.comment_id).toBeNull();
	});

	test("comments.create with a claimed attachment throws", async () => {
		const ticket = await seedOneTicket();
		const { result: uploaded } = await upload(dana, { ticket, file: png("x") });
		await as(dana)((ctx, tx) =>
			comments.create(ctx, tx, { ticket, body: "First.", attachmentIds: [uploaded.attachment.id] }),
		);
		await expectErrorData(
			as(dana)((ctx, tx) =>
				comments.create(ctx, tx, { ticket, body: "Second.", attachmentIds: [uploaded.attachment.id] }),
			),
			"COMMENT_ATTACHMENT_MISMATCH",
		);
	});

	test("attachments.upload names a comment of the same ticket", async () => {
		const ticket = await seedOneTicket();
		const commentId = await seedComment(h.db, ticket, "Look.", dana);
		const { result: uploaded } = await upload(dana, { ticket, file: png("x"), commentId });
		expect(uploaded.attachment.commentId).toBe(commentId);
		const handle = testCtx({ db: h.db, home, actor: dana });
		const listed = await withTx(h.db, (tx, emit) => attachments.list(withEmit(handle.ctx, emit), tx, { ticket }));
		expect(listed.result.map((file) => file.commentId)).toEqual([commentId]);
		const { result: thread } = await as(dana)((ctx, tx) => comments.thread(ctx, tx, { id: commentId }));
		expect(thread.root.attachments?.map((file) => file.id)).toEqual([uploaded.attachment.id]);
	});

	test("attachments.upload with a comment of another ticket throws", async () => {
		const ticket = await seedOneTicket();
		const { rootId, statuses } = await seedProject(h.db, "SEC");
		const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		const commentId = await seedComment(h.db, second, "Elsewhere.", dana);
		const handle = testCtx({ db: h.db, home, actor: dana });
		await expectErrorData(
			withTx(h.db, (tx, emit) =>
				attachments.upload(withEmit(handle.ctx, emit), tx, { ticket, file: png("x"), commentId }),
			),
			"COMMENT_ATTACHMENT_MISMATCH",
		);
	});

	test("comments.delete drops the attachments of the comment and queues their blobs", async () => {
		const ticket = await seedOneTicket();
		const { result: comment } = await as(claude)((ctx, tx) => comments.create(ctx, tx, { ticket, body: "Screens." }));
		const { result: uploaded } = await upload(claude, { ticket, file: png("blob-bytes"), commentId: comment.id });
		const dropped: string[] = [];
		const dropCtx = (ctx: CoreCtx, tx: Tx) =>
			comments.delete({ ...ctx, dropBlobs: (shas: string[]) => void dropped.push(...shas) }, tx, { id: comment.id });
		await as(dana)(dropCtx);
		expect(await attachmentRows(ticket)).toEqual([]);
		expect(dropped).toEqual([uploaded.attachment.sha256]);
		const handle = testCtx({ db: h.db, home, actor: dana });
		await expectErrorData(
			withTx(h.db, (tx, emit) => attachments.get(withEmit(handle.ctx, emit), tx, { id: uploaded.attachment.id })),
			"NOT_FOUND",
		);
	});
});
