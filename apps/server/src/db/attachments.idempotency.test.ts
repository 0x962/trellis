import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { prepareUpload, upload } from "../services/attachments.ts";
import type { IoCtx } from "../services/support.ts";
import { blobPath } from "../storage/blobs.ts";
import { withTx } from "./tx.ts";

const at = new Date("2026-09-17T06:00:00.000Z");
const FORMER_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const LARGE_UPLOAD_BYTES = FORMER_UPLOAD_LIMIT_BYTES + 1;

const pausedFile = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string) => {
	const started = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const file = new File([bytes], name, { type });
	Object.defineProperty(file, "stream", {
		value: () => {
			let sent = false;
			return new ReadableStream<Uint8Array>({
				pull(controller) {
					if (!sent) {
						sent = true;
						controller.enqueue(bytes);
						started.resolve();
						return;
					}
					return release.promise.then(() => controller.close());
				},
			});
		},
	});
	return { file, started: started.promise, release: release.resolve };
};

describe("attachments.upload idempotency", () => {
	test("one client attachment id stores 52,428,801 streamed bytes once", async () => {
		const { openTestDb } = await import("./testDb.ts");
		const db = await openTestDb();
		const home = mkdtempSync(join(tmpdir(), "trellis-attachment-idempotency-"));
		const projectId = ulid();
		const statusId = ulid();
		const ticketId = ulid();
		const uploadId = ulid();
		const ctx: IoCtx = {
			core: { now: at, actorCache: new Map() } as IoCtx["core"],
			actor: { name: "test", kind: "human" },
			session: null,
			home,
			version: "test",
			apiVersion: "test",
			bootId: "test",
			now: () => at,
			ghStatus: () => {
				throw new Error("The test does not read GitHub status.");
			},
			addresses: async () => [],
			log: () => undefined,
			emit: () => undefined,
			afterCommit: () => undefined,
			newTx: (fn) => db.transaction(fn),
			vacuum: async () => undefined,
		};
		mkdirSync(join(home, "attachments", "tmp"), { recursive: true });

		try {
			await db.execute(sql`
				INSERT INTO projects (id, key, slug, name, created_at, updated_at)
				VALUES (${projectId}, 'TST', 'test', 'Test', ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
				VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
				VALUES (${ticketId}, ${projectId}, 1, 'Test', ${statusId}, 0, ${at}, ${at})
			`);
			const bytes = new Uint8Array(LARGE_UPLOAD_BYTES).fill(120);
			const paused = pausedFile(bytes, "plan.txt", "text/plain");
			const input = {
				id: uploadId,
				ticket: ticketId,
				file: paused.file,
			};
			const preparing = prepareUpload(ctx, input);
			await paused.started;
			const concurrentDatabaseWork = Promise.all([
				db.execute(sql`SELECT count(*) FROM agent_runs`),
				db.execute(sql`UPDATE tickets SET title=title WHERE id=${ticketId}`),
			]);
			const completedWhileFileWasPaused = await Promise.race([
				concurrentDatabaseWork.then(() => true),
				new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
			]);
			paused.release();
			await concurrentDatabaseWork;
			expect(completedWhileFileWasPaused).toBe(true);
			const firstInput = await preparing;
			const first = await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, firstInput));
			const retryInput = await prepareUpload(ctx, {
				...input,
				file: new File([bytes], "plan.txt", { type: "text/plain" }),
			});
			const retry = await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, retryInput));
			const attachments = await db.execute(sql`SELECT id FROM attachments`);
			const activity = await db.execute(sql`SELECT id FROM activity WHERE action = 'attachment.created'`);
			const tickets = await db.execute(sql`SELECT version FROM tickets WHERE id = ${ticketId}`);

			expect(retry.result).toEqual(first.result);
			expect(first.result.attachment.size).toBe(LARGE_UPLOAD_BYTES);
			expect(statSync(blobPath(home, first.result.attachment.sha256)).size).toBe(LARGE_UPLOAD_BYTES);
			expect(attachments.rows).toEqual([{ id: uploadId }]);
			expect(activity.rows).toHaveLength(1);
			expect(tickets.rows[0]!.version).toBe(2);
		} finally {
			// Remove the temporary directory before the call to
			// db.$client.close(). A close that throws would otherwise leave the
			// directory on disk.
			rmSync(home, { recursive: true, force: true });
			await db.$client.close();
		}
	});

	test("one client attachment id rejects different bytes", async () => {
		const { openTestDb } = await import("./testDb.ts");
		const db = await openTestDb();
		const home = mkdtempSync(join(tmpdir(), "trellis-attachment-idempotency-"));
		const projectId = ulid();
		const statusId = ulid();
		const ticketId = ulid();
		const uploadId = ulid();
		const ctx: ServiceCtx = {
			actor: { name: "test", kind: "human" },
			session: null,
			home,
			version: "test",
			apiVersion: "test",
			bootId: "test",
			now: () => at,
			ghStatus: () => {
				throw new Error("The test does not read GitHub status.");
			},
			addresses: async () => [],
			log: () => undefined,
			emit: () => undefined,
			afterCommit: () => undefined,
			newTx: (fn) => db.transaction(fn),
			vacuum: async () => undefined,
		};
		mkdirSync(join(home, "attachments", "tmp"), { recursive: true });

		try {
			await db.execute(sql`
				INSERT INTO projects (id, key, slug, name, created_at, updated_at)
				VALUES (${projectId}, 'TST', 'test', 'Test', ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
				VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
				VALUES (${ticketId}, ${projectId}, 1, 'Test', ${statusId}, 0, ${at}, ${at})
			`);
			const firstInput = {
				id: uploadId,
				ticket: ticketId,
				file: new File(["same bytes"], "plan.txt", { type: "text/plain" }),
			};
			const mismatchInput = {
				...firstInput,
				file: new File(["other data"], "plan.txt", { type: "text/plain" }),
			};
			const preparedFirst = await prepareUpload(ctx, firstInput);
			await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, preparedFirst));

			await expect(prepareUpload(ctx, mismatchInput)).rejects.toThrow("This id already identifies another attachment.");
			const attachments = await db.execute(sql`SELECT id FROM attachments`);
			const activity = await db.execute(sql`SELECT id FROM activity WHERE action = 'attachment.created'`);
			const tickets = await db.execute(sql`SELECT version FROM tickets WHERE id = ${ticketId}`);

			expect(attachments.rows).toEqual([{ id: uploadId }]);
			expect(activity.rows).toHaveLength(1);
			expect(tickets.rows[0]!.version).toBe(2);
		} finally {
			// Remove the temporary directory before the call to
			// db.$client.close(). A close that throws would otherwise leave the
			// directory on disk.
			rmSync(home, { recursive: true, force: true });
			await db.$client.close();
		}
	});
});
