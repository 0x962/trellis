import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { upload } from "../services/attachments.ts";
import type { ServiceCtx } from "../services/support.ts";
import { withTx } from "./tx.ts";

const at = new Date("2026-09-17T06:00:00.000Z");

describe("attachments.upload idempotency", () => {
	test("one client attachment id creates one row across a repeated request", async () => {
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
			maxUploadBytes: 50 * 1024 * 1024,
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
				INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
				VALUES (${projectId}, ${projectId}, 'TST', 'test', 'Test', ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
				VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
				VALUES (${ticketId}, ${projectId}, ${projectId}, 1, 'Test', ${statusId}, 0, ${at}, ${at})
			`);
			const input = {
				id: uploadId,
				ticket: ticketId,
				file: new File(["same bytes"], "plan.txt", { type: "text/plain" }),
			};
			const first = await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, input));
			const retry = await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, input));
			const attachments = await db.execute(sql`SELECT id FROM attachments`);
			const activity = await db.execute(sql`SELECT id FROM activity WHERE action = 'attachment.created'`);
			const tickets = await db.execute(sql`SELECT version FROM tickets WHERE id = ${ticketId}`);

			expect(retry.result).toEqual(first.result);
			expect(attachments.rows).toEqual([{ id: uploadId }]);
			expect(activity.rows).toHaveLength(1);
			expect(tickets.rows[0]!.version).toBe(2);
		} finally {
			await db.$client.close();
			rmSync(home, { recursive: true, force: true });
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
			maxUploadBytes: 50 * 1024 * 1024,
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
				INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
				VALUES (${projectId}, ${projectId}, 'TST', 'test', 'Test', ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
				VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
			`);
			await db.execute(sql`
				INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
				VALUES (${ticketId}, ${projectId}, ${projectId}, 1, 'Test', ${statusId}, 0, ${at}, ${at})
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
			await withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, firstInput));

			await expect(withTx(db, (tx, emit) => upload({ ...ctx, emit }, tx, mismatchInput))).rejects.toThrow(
				"This id already identifies another attachment.",
			);
			const attachments = await db.execute(sql`SELECT id FROM attachments`);
			const activity = await db.execute(sql`SELECT id FROM activity WHERE action = 'attachment.created'`);
			const tickets = await db.execute(sql`SELECT version FROM tickets WHERE id = ${ticketId}`);

			expect(attachments.rows).toEqual([{ id: uploadId }]);
			expect(activity.rows).toHaveLength(1);
			expect(tickets.rows[0]!.version).toBe(2);
		} finally {
			await db.$client.close();
			rmSync(home, { recursive: true, force: true });
		}
	});
});
