import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { InputLedger } from "../../../../runtime/src/inputLedger.ts";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { createPageComment } from "./comments";
import { prepareWatchDispatch } from "./dispatchWatches";
import { remove } from "./pages.ts";
import { completeWatchBatch, reserveWatchBatch, WATCH_LEASE_MS } from "./watchBatch";
import { watch } from "./watches.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let directory: string;
const cache = createCache();
const projectId = ulid();
const agentId = ulid();
const otherId = ulid();
const at = new Date("2026-09-26T00:00:00Z");
const core: ServiceCtx = {
	actor: { kind: "human", name: "reader" },
	session: null,
	reqId: "watch-test",
	now: at,
	cache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
};
const tx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const ctx = (now = at): IoCtx => ({
	core,
	actor: core.actor!,
	session: null,
	now: () => now,
	home: directory,
	publicUrl: core.publicUrl,
	localUrl: core.publicUrl,
	newTx: tx,
	emit: () => {},
	log: () => {},
	afterCommit: () => {},
	background: () => {},
	vacuum: async () => {},
	maxUploadBytes: 1000,
	version: "test",
	apiVersion: "1",
	bootId: "test",
	ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: null }),
	addresses: async () => [],
});

beforeAll(async () => {
	db = await openTestDb();
	directory = await mkdtemp(join(tmpdir(), "trellis-watches-"));
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES
		('reader', 'human', ${at}, ${at}), (${agentId}, 'agent', ${at}, ${at}), (${otherId}, 'agent', ${at}, ${at})`);
	await db.execute(
		sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES (${projectId}, 'WAT', 'watch', 'Watch', ${at}, ${at})`,
	);
	for (const id of [agentId, otherId])
		await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, terminal_id, created_at, updated_at)
		VALUES (${id}, ${id}, 'agent', 'Read comments', ${projectId}, 'WAT', ${id}, ${at}, ${at})`);
	await tx(cache.rebuild);
}, 30_000);
afterAll(async () => {
	await db.$client.close();
	await rm(directory, { recursive: true });
});

async function fixture() {
	await db.execute(sql`DELETE FROM page_watches`);
	const id = ulid();
	await db.execute(sql`INSERT INTO pages (id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, ${projectId}, ${id.toLowerCase()}, 'Report', '', 1, 1, ${agentId}, 'agent', ${agentId}, 'agent', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO page_versions (page_id, number, request_id, document_sha256, document_size, source_agent_id, source_path, actor_name, actor_kind, created_at)
		VALUES (${id}, 1, ${randomUUID()}, ${"a".repeat(64)}, 1, ${agentId}, 'report/index.html', ${agentId}, 'agent', ${at})`);
	await tx((t) => watch(core, t, { page: id, agentId }));
	const comment = async (body: string, offset = 1, human = true) =>
		tx((t) =>
			createPageComment(
				{ ...core, now: new Date(at.getTime() + offset), actor: human ? core.actor : { name: agentId, kind: "agent" } },
				t,
				{ page: id, version: 1, anchor: { kind: "element", path: "html>body" }, body },
			),
		);
	const reserve = (now = at) => tx((t) => reserveWatchBatch(t, { pageId: id, now, publicUrl: core.publicUrl }));
	return { id, comment, reserve };
}
const later = () => new Date(at.getTime() + WATCH_LEASE_MS + 1);
const row = async (id: string) => (await db.execute(sql`SELECT * FROM page_watches WHERE page_id = ${id}`)).rows[0]!;

test("reserves human comments in cursor order and preserves bytes and boundary through edits and later arrivals", async () => {
	const f = await fixture();
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
	await tx((t) => completeWatchBatch(t, batch));
	await tx((t) => completeWatchBatch(t, batch));
	const next = (await f.reserve(later()))!;
	expect(next.messageId).not.toBe(batch.messageId);
	expect(next.payload.text).toContain('"body":"Later"');
	expect(next.payload.text).not.toContain('"body":"First"');
});

test("a crash after acceptance retries the persisted message ID through the real input ledger", async () => {
	const f = await fixture();
	await f.comment("Accept once");
	const ledgerPath = join(directory, `${f.id}.json`);
	let ledger = new InputLedger(ledgerPath);
	let writes = 0;
	let crash = true;
	const deps = {
		read: async () => [{ id: agentId, status: "running", controllable: true }] as RuntimeProcessStatus[],
		inspect: async () => ({ acknowledgedMessageIds: [] }),
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
	await prepareWatchDispatch(ctx(), {}, deps);
	expect((await row(f.id)).cursor_id).toBeNull();
	const messageId = (await row(f.id)).reservation_id;
	await f.comment("Next batch", 2);
	ledger = new InputLedger(ledgerPath);
	await prepareWatchDispatch(ctx(later()), {}, deps);
	expect(writes).toBe(1);
	expect((await row(f.id)).last_completed_reservation_id).toBe(messageId);
	expect((await row(f.id)).cursor_id).not.toBeNull();
	expect((await f.reserve(later()))!.payload.text).toContain("Next batch");
});

test("an acknowledged native delivery completes after a cursor transaction crashes and the agent resumes", async () => {
	const f = await fixture();
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
		tx(async (t) => {
			await completeWatchBatch(t, batch);
			throw new Error("Cursor crash");
		}),
	).rejects.toThrow("Cursor crash");
	ledger = new InputLedger(ledgerPath);
	const replacement = randomUUID();
	await db.execute(sql`UPDATE agent_runs SET terminal_id = ${replacement} WHERE id = ${agentId}`);
	await prepareWatchDispatch(
		ctx(later()),
		{},
		{
			read: async () => [{ id: replacement, status: "running", controllable: true }] as RuntimeProcessStatus[],
			inspect: async (id) => {
				expect(id).toBe(batch.payload.terminalId);
				return { acknowledgedMessageIds: ledger.acknowledgedMessageIds() };
			},
			send: async () => {
				throw new Error("Duplicate send");
			},
		},
	);
	expect(writes).toBe(1);
	expect((await row(f.id)).last_completed_reservation_id).toBe(batch.messageId);
	await db.execute(sql`UPDATE agent_runs SET terminal_id = ${agentId} WHERE id = ${agentId}`);
});

test("a stopped watcher keeps queued comments and a busy resumed process accepts them without interruption", async () => {
	const f = await fixture();
	await f.comment("While stopped");
	let running = false;
	let sends = 0;
	const deps = {
		read: async () =>
			[
				{ id: agentId, status: running ? "running" : "exited", controllable: running, activity: { state: "working" } },
			] as RuntimeProcessStatus[],
		inspect: async () => ({ acknowledgedMessageIds: [] }),
		send: async (_ctx: IoCtx, input: { id: string; interrupt?: boolean }) => {
			expect(input.interrupt).toBeUndefined();
			sends++;
			return { id: input.id };
		},
	};
	await prepareWatchDispatch(ctx(), {}, deps);
	expect(sends).toBe(0);
	expect((await row(f.id)).agent_id).toBe(agentId);
	expect((await row(f.id)).reservation_id).toBeNull();
	running = true;
	await prepareWatchDispatch(ctx(), {}, deps);
	expect(sends).toBe(1);
});

test("reassignment invalidates old completion and deletion removes the watch", async () => {
	const f = await fixture();
	await f.comment("Reassign");
	const old = (await f.reserve())!;
	await tx((t) => watch(core, t, { page: f.id, agentId: otherId }));
	await tx((t) => completeWatchBatch(t, old));
	expect((await row(f.id)).cursor_id).toBeNull();
	expect((await f.reserve())!.agentId).toBe(otherId);
	await tx((t) => remove(core, t, { page: f.id, expectedVersion: 1 }));
	expect(await f.reserve(later())).toBeNull();
	expect(await row(f.id)).toBeUndefined();
});

test("only a person or the publishing agent can change an eligible watcher", async () => {
	const f = await fixture();
	const agent = { ...core, actor: { kind: "agent" as const, name: agentId } };
	await expect(tx((t) => watch(agent, t, { page: f.id, agentId: otherId }))).rejects.toThrow("Only a person");
	await expect(
		tx((t) => watch({ ...agent, actor: { kind: "agent", name: otherId } }, t, { page: f.id, agentId: otherId })),
	).rejects.toThrow("Only a person");
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${otherId}`);
	await expect(tx((t) => watch(core, t, { page: f.id, agentId: otherId }))).rejects.toThrow("Choose an assigned agent");
	await db.execute(sql`UPDATE agent_runs SET closed_at = NULL WHERE id = ${otherId}`);
	await tx((t) => watch(agent, t, { page: f.id, agentId: null }));
	expect(await row(f.id)).toBeUndefined();
});

test("same-time requests preserve insertion order and a repeated assignment keeps the reservation", async () => {
	const f = await fixture();
	const ids: string[] = [];
	for (let i = 0; i < 7; i++) ids.push((await f.comment(`Comment ${i}`)).comments[0]!.id);
	const batch = (await f.reserve())!;
	await tx((t) => watch(core, t, { page: f.id, agentId }));
	expect((await row(f.id)).reservation_id).toBe(batch.messageId);
	expect(batch.payload.text.match(/"body":"Comment/g)).toHaveLength(5);
	await tx((t) => completeWatchBatch(t, batch));
	expect((await row(f.id)).cursor_id).toBe(ids[4]!);
	const next = (await f.reserve())!;
	expect(next.payload.text.match(/"body":"Comment/g)).toHaveLength(2);
	await tx((t) => completeWatchBatch(t, next));
	await f.comment("Delayed request", 0);
	expect((await f.reserve())!.payload.text).toContain("Delayed request");
});

test("archive and an explicit unwatch stop dispatch, and a foreign project cannot supply the watcher", async () => {
	const f = await fixture();
	await f.comment("Wait");
	await db.execute(sql`UPDATE projects SET archived_at = ${at} WHERE id = ${projectId}`);
	await tx(cache.rebuild);
	expect(await f.reserve()).toBeNull();
	await expect(tx((t) => watch(core, t, { page: f.id, agentId: null }))).rejects.toMatchObject({
		code: "PROJECT_ARCHIVED",
	});
	await db.execute(sql`UPDATE projects SET archived_at = NULL WHERE id = ${projectId}`);
	await tx(cache.rebuild);
	await db.execute(sql`UPDATE agent_runs SET project_id = NULL WHERE id = ${otherId}`);
	await expect(tx((t) => watch(core, t, { page: f.id, agentId: otherId }))).rejects.toThrow("Choose an assigned agent");
	await db.execute(sql`UPDATE agent_runs SET project_id = ${projectId} WHERE id = ${otherId}`);
	await tx((t) => watch(core, t, { page: f.id, agentId: null }));
	expect(await f.reserve()).toBeNull();
});
