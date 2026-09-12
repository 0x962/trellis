import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { count, hoursAgo, seedProject, seedTicket } from "../../../fixtures";
import { eventSink, testCtx, withEmit } from "../../../helpers/ctx.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { caught } from "../../../helpers/errors.ts";
import { freshHomeWithDirs, sha256Of } from "../../../helpers/home.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import { withTx } from "../../../../src/db/tx.ts";
import { blobPath } from "../../../../src/storage/blobs.ts";
import { gcAttachmentBlobs, get, remove, upload } from "../../../../src/services/attachments.ts";

// A delete removes the row inside the transaction and queues the blob check
// for after the commit. A rolled back delete therefore keeps the blob.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

const seedOneTicket = async (number = 1) => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.todo,
		number,
		updatedAt: hoursAgo(5),
	});
	return { rootId, ticket };
};

const fileOf = (text: string, name = "notes.txt") =>
	new File([new TextEncoder().encode(text)], name, { type: "text/plain" });

const runUpload = async (ticket: string, text: string) => {
	const handle = testCtx({ db: h.db, home });
	const { result } = await withTx(h.db, (tx, emit) =>
		upload(withEmit(handle.ctx, emit), tx, { ticket, file: fileOf(text) }),
	);
	await handle.runAfterCommit();
	return result;
};

describe("attachments.remove", () => {
	test("a delete of the last row unlinks the blob after the commit", async () => {
		await seedOneTicket();
		const uploaded = await runUpload("CDE-1", "the only row on this sha");
		const sha = uploaded.attachment.sha256;
		const handle = testCtx({ db: h.db, home });

		const { result } = await withTx(h.db, (tx, emit) =>
			remove(withEmit(handle.ctx, emit), tx, { id: uploaded.attachment.id }),
		);

		expect(result).toEqual({ deleted: uploaded.attachment.id });
		expect(existsSync(blobPath(home, sha))).toBe(true);
		await handle.runAfterCommit();
		expect(existsSync(blobPath(home, sha))).toBe(false);
	});

	test("a rolled back delete keeps the blob", async () => {
		await seedOneTicket();
		const uploaded = await runUpload("CDE-1", "a delete that rolls back");
		const sha = uploaded.attachment.sha256;
		const handle = testCtx({ db: h.db, home });

		const failure = await caught(
			withTx(h.db, async (tx, emit) => {
				await remove(withEmit(handle.ctx, emit), tx, { id: uploaded.attachment.id });
				throw new Error("the caller failed after the row delete");
			}),
		);

		expect(failure.message).toBe("the caller failed after the row delete");
		expect(await count(h.db, "attachments")).toBe(1);
		expect(existsSync(blobPath(home, sha))).toBe(true);
	});

	test("a delete emits ticket.updated with the new attachment count", async () => {
		const { ticket } = await seedOneTicket();
		const uploaded = await runUpload("CDE-1", "one of two");
		await runUpload("CDE-1", "two of two");
		const handle = testCtx({ db: h.db, home });
		const { delivered, sink } = eventSink();

		await withTx(h.db, (tx, emit) => remove(withEmit(handle.ctx, emit), tx, { id: uploaded.attachment.id }), sink);

		const updates = delivered.filter((event) => event.type === "ticket.updated");
		expect(updates).toHaveLength(1);
		const [update] = updates as Extract<TrellisEvent, { type: "ticket.updated" }>[];
		expect(update!.summary.id).toBe(ticket);
		expect(update!.summary.attachmentCount).toBe(1);
		expect(update!.fields).toEqual(["attachmentCount"]);
	});

	test("a delete emits attachment.deleted and moves the ticket", async () => {
		const { rootId, ticket } = await seedOneTicket();
		const uploaded = await runUpload("CDE-1", "a row with an event");
		const [before] = await rows("tickets");
		const handle = testCtx({ db: h.db, home });
		const { delivered, sink } = eventSink();

		await withTx(h.db, (tx, emit) => remove(withEmit(handle.ctx, emit), tx, { id: uploaded.attachment.id }), sink);

		const expected = [
			{ type: "attachment.deleted", id: uploaded.attachment.id, ticketId: ticket, projectId: rootId },
		] satisfies TrellisEvent[];
		expect(delivered.filter((event) => event.type === "attachment.deleted")).toEqual(expected);
		const [after] = await rows("tickets");
		expect(after!.version).toBe((before!.version as number) + 1);
		expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
			new Date(before!.updated_at as string).getTime(),
		);
	});

	test("an unknown attachment id is NOT_FOUND", async () => {
		await seedOneTicket();
		const id = ulid();
		const handle = testCtx({ db: h.db, home });

		const removed = await caught(withTx(h.db, (tx, emit) => remove(withEmit(handle.ctx, emit), tx, { id })));
		expect(removed.code).toBe("NOT_FOUND");
		expect(removed.data).toEqual({ kind: "attachment", ref: id });

		const read = await caught(withTx(h.db, (tx, emit) => get(withEmit(handle.ctx, emit), tx, { id })));
		expect(read.code).toBe("NOT_FOUND");
		expect(read.data).toEqual({ kind: "attachment", ref: id });
	});

	test("a ticket delete drops the blobs whose last row went", async () => {
		await seedOneTicket();
		const kept = await runUpload("CDE-1", "a file two tickets hold");
		const first = await runUpload("CDE-1", "the first file of the ticket");
		const second = await runUpload("CDE-1", "the second file of the ticket");
		const shas = [kept.attachment.sha256, first.attachment.sha256, second.attachment.sha256];
		await h.db.execute(sql`DELETE FROM attachments WHERE id <> ${kept.attachment.id}`);
		const handle = testCtx({ db: h.db, home });

		const result = await gcAttachmentBlobs(handle.ctx, shas);

		expect(result.removed.sort()).toEqual([first.attachment.sha256, second.attachment.sha256].sort());
		expect(existsSync(blobPath(home, kept.attachment.sha256))).toBe(true);
		expect(existsSync(blobPath(home, first.attachment.sha256))).toBe(false);
		expect(existsSync(blobPath(home, second.attachment.sha256))).toBe(false);
		expect(sha256Of(new TextEncoder().encode("a file two tickets hold"))).toBe(kept.attachment.sha256);
	});
});
