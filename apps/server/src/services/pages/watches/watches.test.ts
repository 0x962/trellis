import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { InputLedger } from "../../../../../runtime/src/inputLedger.ts";
import type { IoCtx } from "../../support.ts";
import { prepareWatchDispatch } from "../dispatchWatches";
import { remove } from "../pages.ts";
import { completeCommentBatch } from "../watchBatch";
import { watcherOptions } from "../watcherOptions";
import { watch } from "./watches";
import {
	agentId,
	core,
	db,
	directory,
	later,
	otherId,
	pageWithWatcher,
	projectId,
	watchAt,
	watchCache,
	watchCtx,
	watchRow,
	watchTx,
} from "./watches.fixture";
import { registerResumeCases } from "./watches.resumeCases";

test("reserves human comments in cursor order and preserves bytes and boundary through edits and later arrivals", async () => {
	const f = await pageWithWatcher();
	await f.comment("Earlier", 1);
	const first = await f.comment("First", 2);
	await f.comment("Agent reply", 3, false);
	const batch = (await f.reserve())!;
	expect(batch.payload.text.indexOf("Earlier")).toBeLessThan(batch.payload.text.indexOf("First"));
	expect(batch.payload.text).not.toContain("Agent reply");
	expect(batch.payload.text).toContain('"version":1');
	expect(batch.payload.text).toContain("report/index.html");
	expect(batch.payload.text).toContain("POST /api/page-comment-threads/<thread_id>/replies");
	expect(await f.reserve()).toBeNull();
	await db.execute(sql`UPDATE page_comments SET body = 'Edited' WHERE id = ${first.comments[0]!.id}`);
	await f.comment("Later", 4);
	const retried = await f.reserve(later());
	expect(retried).toEqual(batch);
	await watchTx((t) => completeCommentBatch(t, batch));
	await watchTx((t) => completeCommentBatch(t, batch));
	const next = (await f.reserve(later()))!;
	expect(next.messageId).not.toBe(batch.messageId);
	expect(next.payload.text).toContain('"body":"Later"');
	expect(next.payload.text).not.toContain('"body":"First"');
});

test("a crash after acceptance retries the persisted message ID through the real input ledger", async () => {
	const f = await pageWithWatcher();
	await f.comment("Accept once");
	const ledgerPath = join(directory, `${f.id}.json`);
	let ledger = new InputLedger(ledgerPath);
	let writes = 0;
	let crash = true;
	const deps = {
		read: async () => [{ id: agentId, status: "running", controllable: true }] as RuntimeProcessStatus[],
		receipt: async (_id: string, messageId: string) => ({
			messageId,
			registered: false,
			delivered: false,
			status: "running" as const,
		}),
		send: async (_ctx: IoCtx, input: { id: string; text: string; messageId?: string }) => {
			const sent = await ledger.deliver(input.messageId!, Buffer.from(input.text).toString("base64"), async () => {
				writes++;
			});
			expect(sent.status).toBe("written");
			if (crash) {
				crash = false;
				throw new Error("Crash after acceptance");
			}
			return { id: input.id };
		},
	};
	await prepareWatchDispatch(watchCtx(), {}, deps);
	expect((await watchRow(f.id)).cursor_id).toBeNull();
	const messageId = (await watchRow(f.id)).reservation_id;
	await f.comment("Next batch", 2);
	ledger = new InputLedger(ledgerPath);
	await prepareWatchDispatch(watchCtx(later()), {}, deps);
	expect(writes).toBe(1);
	expect((await watchRow(f.id)).last_completed_reservation_id).toBe(messageId);
	expect((await watchRow(f.id)).cursor_id).not.toBeNull();
	expect((await f.reserve(later()))!.payload.text).toContain("Next batch");
});

test("an acknowledged native delivery completes after a cursor transaction crashes and the agent resumes", async () => {
	const f = await pageWithWatcher();
	await f.comment("Native once");
	const batch = (await f.reserve())!;
	const ledgerPath = join(directory, `${f.id}.json`);
	let ledger = new InputLedger(ledgerPath);
	let writes = 0;
	ledger.registerNative(batch.messageId, createHash("sha256").update(batch.payload.text).digest("hex"), () => {
		writes++;
	});
	ledger.acknowledge(batch.messageId);
	await expect(
		watchTx(async (t) => {
			await completeCommentBatch(t, batch);
			throw new Error("Cursor crash");
		}),
	).rejects.toThrow("Cursor crash");
	ledger = new InputLedger(ledgerPath);
	const replacement = randomUUID();
	await db.execute(sql`UPDATE agent_runs SET terminal_id = ${replacement} WHERE id = ${agentId}`);
	await prepareWatchDispatch(
		watchCtx(later()),
		{},
		{
			read: async () => [{ id: replacement, status: "running", controllable: true }] as RuntimeProcessStatus[],
			receipt: async (id, messageId) => {
				expect(id).toBe(batch.payload.terminalId);
				return {
					messageId,
					registered: ledger.has(messageId),
					delivered: ledger.delivered(messageId),
					status: "exited",
				};
			},
			send: async () => {
				throw new Error("Duplicate send");
			},
		},
	);
	expect(writes).toBe(1);
	expect((await watchRow(f.id)).last_completed_reservation_id).toBe(batch.messageId);
	await db.execute(sql`UPDATE agent_runs SET terminal_id = ${agentId} WHERE id = ${agentId}`);
});

test("a stopped watcher keeps queued comments and a busy resumed process accepts them without interruption", async () => {
	const f = await pageWithWatcher();
	await f.comment("While stopped");
	let running = false;
	let sends = 0;
	const deps = {
		read: async () =>
			[
				{ id: agentId, status: running ? "running" : "exited", controllable: running, activity: { state: "working" } },
			] as RuntimeProcessStatus[],
		receipt: async (_id: string, messageId: string) => ({
			messageId,
			registered: false,
			delivered: false,
			status: "running" as const,
		}),
		send: async (_ctx: IoCtx, input: { id: string; interrupt?: boolean }) => {
			expect(input.interrupt).toBeUndefined();
			sends++;
			return { id: input.id };
		},
	};
	await prepareWatchDispatch(watchCtx(), {}, deps);
	expect(sends).toBe(0);
	expect((await watchRow(f.id)).agent_id).toBe(agentId);
	expect((await watchRow(f.id)).reservation_id).toBeNull();
	running = true;
	await prepareWatchDispatch(watchCtx(), {}, deps);
	expect(sends).toBe(1);
});

test("reassignment invalidates old completion and deletion removes the watch", async () => {
	const f = await pageWithWatcher();
	await f.comment("Reassign");
	const old = (await f.reserve())!;
	await watchTx((t) => watch(core, t, { page: f.id, agentId: otherId }));
	await watchTx((t) => completeCommentBatch(t, old));
	expect((await watchRow(f.id)).cursor_id).toBeNull();
	expect((await f.reserve())!.agentId).toBe(otherId);
	await watchTx((t) => remove(core, t, { page: f.id, expectedVersion: 1 }));
	expect(await f.reserve(later())).toBeNull();
	expect(await watchRow(f.id)).toBeUndefined();
});

test("only a person or the publishing agent can change an eligible watcher", async () => {
	const f = await pageWithWatcher();
	const agent = { ...core, actor: { kind: "agent" as const, name: agentId } };
	await expect(watchTx((t) => watch(agent, t, { page: f.id, agentId: otherId }))).rejects.toThrow("Only a person");
	await expect(
		watchTx((t) => watch({ ...agent, actor: { kind: "agent", name: otherId } }, t, { page: f.id, agentId: otherId })),
	).rejects.toThrow("Only a person");
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${watchAt} WHERE id = ${otherId}`);
	await expect(watchTx((t) => watch(core, t, { page: f.id, agentId: otherId }))).rejects.toThrow(
		"Choose an assigned agent",
	);
	await db.execute(sql`UPDATE agent_runs SET closed_at = NULL WHERE id = ${otherId}`);
	await watchTx((t) => watch(agent, t, { page: f.id, agentId: null }));
	expect(await watchRow(f.id)).toBeUndefined();
});

test("same-time requests preserve insertion order and a repeated assignment keeps the reservation", async () => {
	const f = await pageWithWatcher();
	const ids: string[] = [];
	for (let i = 0; i < 7; i++) ids.push((await f.comment(`Comment ${i}`)).comments[0]!.id);
	const batch = (await f.reserve())!;
	await watchTx((t) => watch(core, t, { page: f.id, agentId }));
	expect((await watchRow(f.id)).reservation_id).toBe(batch.messageId);
	expect(batch.payload.text.match(/"body":"Comment/g)).toHaveLength(5);
	await watchTx((t) => completeCommentBatch(t, batch));
	expect((await watchRow(f.id)).cursor_id).toBe(ids[4]!);
	const next = (await f.reserve())!;
	expect(next.payload.text.match(/"body":"Comment/g)).toHaveLength(2);
	await watchTx((t) => completeCommentBatch(t, next));
	await f.comment("Delayed request", 0);
	expect((await f.reserve())!.payload.text).toContain("Delayed request");
});

test("archive and an explicit unwatch stop dispatch, and a foreign project cannot supply the watcher", async () => {
	const f = await pageWithWatcher();
	await f.comment("Wait");
	await db.execute(sql`UPDATE projects SET archived_at = ${watchAt} WHERE id = ${projectId}`);
	await watchTx(watchCache.rebuild);
	expect(await f.reserve()).toBeNull();
	await expect(watchTx((t) => watch(core, t, { page: f.id, agentId: null }))).rejects.toMatchObject({
		code: "PROJECT_ARCHIVED",
	});
	await db.execute(sql`UPDATE projects SET archived_at = NULL WHERE id = ${projectId}`);
	await watchTx(watchCache.rebuild);
	await db.execute(sql`UPDATE agent_runs SET project_id = NULL WHERE id = ${otherId}`);
	await expect(watchTx((t) => watch(core, t, { page: f.id, agentId: otherId }))).rejects.toThrow(
		"Choose an assigned agent",
	);
	await db.execute(sql`UPDATE agent_runs SET project_id = ${projectId} WHERE id = ${otherId}`);
	await watchTx((t) => watch(core, t, { page: f.id, agentId: null }));
	expect(await f.reserve()).toBeNull();
});

test("a reservation payload and its message ID must be present together", async () => {
	const f = await pageWithWatcher();
	await expect(
		db.execute(sql`UPDATE page_watches SET reservation_payload = '{}'::jsonb WHERE page_id = ${f.id}`),
	).rejects.toThrow("page_watches_reservation_check");
	await f.comment("Keep the accepted bytes");
	await f.reserve();
	await expect(
		db.execute(sql`UPDATE page_watches SET reservation_payload = NULL WHERE page_id = ${f.id}`),
	).rejects.toThrow("page_watches_reservation_check");
});

test("watcher options contain at most 100 eligible agents in this project", async () => {
	const f = await pageWithWatcher();
	const ids = Array.from({ length: 101 }, () => ulid());
	const values = ids.map((id) => sql`(${id}, ${id}, 'agent', '', ${projectId}, 'WAT', ${watchAt}, ${watchAt})`);
	await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, created_at, updated_at)
		VALUES ${sql.join(values, sql`,`)}`);
	await db.execute(sql`UPDATE agent_runs SET kind = 'flow' WHERE id = ${otherId}`);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${watchAt} WHERE id = ${agentId}`);
	const options = await watchTx((tx) => watcherOptions(core, tx, { page: f.id }));
	expect(options).toHaveLength(100);
	expect(options.every((option) => ids.includes(option.id))).toBe(true);
	await db.execute(
		sql`DELETE FROM agent_runs WHERE id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`,`,
		)})`,
	);
	await db.execute(sql`UPDATE agent_runs SET kind = 'agent', closed_at = NULL WHERE id IN (${agentId}, ${otherId})`);
});

registerResumeCases();
