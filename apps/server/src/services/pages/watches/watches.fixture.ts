import { afterAll, beforeAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";
import { createPageComment } from "../comments";
import { COMMENT_BATCH_LEASE_MS, reserveCommentBatch } from "../watchBatch";
import { watch } from "./watches";

let db: Awaited<ReturnType<typeof openTestDb>>;
let directory: string;
const watchCache = createCache();
const projectId = ulid();
const agentId = ulid();
const otherId = ulid();
const watchAt = new Date("2026-09-26T00:00:00Z");
const core: ServiceCtx = {
	actor: { kind: "human", name: "reader" },
	session: null,
	reqId: "watch-test",
	now: watchAt,
	cache: watchCache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
};
const watchTx = <T>(fn: (watchTx: Tx) => Promise<T>) => db.transaction(fn);
const watchCtx = (now = watchAt): IoCtx => ({
	core,
	actor: core.actor!,
	session: null,
	now: () => now,
	home: directory,
	publicUrl: core.publicUrl,
	localUrl: core.publicUrl,
	newTx: watchTx,
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
		('reader', 'human', ${watchAt}, ${watchAt}), (${agentId}, 'agent', ${watchAt}, ${watchAt}), (${otherId}, 'agent', ${watchAt}, ${watchAt})`);
	await db.execute(
		sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES (${projectId}, 'WAT', 'watch', 'Watch', ${watchAt}, ${watchAt})`,
	);
	for (const id of [agentId, otherId])
		await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, terminal_id, created_at, updated_at)
		VALUES (${id}, ${id}, 'agent', 'Read comments', ${projectId}, 'WAT', ${id}, ${watchAt}, ${watchAt})`);
	await watchTx(watchCache.rebuild);
}, 30_000);
afterAll(async () => {
	await db.$client.close();
	await rm(directory, { recursive: true });
});

async function pageWithWatcher() {
	await db.execute(sql`DELETE FROM page_watches`);
	const id = ulid();
	await db.execute(sql`INSERT INTO pages (id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, ${projectId}, ${id.toLowerCase()}, 'Report', '', 1, 1, ${agentId}, 'agent', ${agentId}, 'agent', ${watchAt}, ${watchAt})`);
	await db.execute(sql`INSERT INTO page_versions (page_id, number, request_id, document_sha256, document_size, source_agent_id, source_path, actor_name, actor_kind, created_at)
		VALUES (${id}, 1, ${randomUUID()}, ${"a".repeat(64)}, 1, ${agentId}, 'report/index.html', ${agentId}, 'agent', ${watchAt})`);
	await watchTx((t) => watch(core, t, { page: id, agentId }));
	const comment = async (body: string, offset = 1, human = true) =>
		watchTx((t) =>
			createPageComment(
				{
					...core,
					now: new Date(watchAt.getTime() + offset),
					actor: human ? core.actor : { name: agentId, kind: "agent" },
				},
				t,
				{ page: id, version: 1, anchor: { kind: "element", path: "html>body" }, body },
			),
		);
	const reserve = (now = watchAt) =>
		watchTx((t) => reserveCommentBatch(core, t, { pageId: id, now, publicUrl: core.publicUrl }));
	return { id, comment, reserve };
}
const later = () => new Date(watchAt.getTime() + COMMENT_BATCH_LEASE_MS + 1);
const watchRow = async (id: string) =>
	(await db.execute(sql`SELECT * FROM page_watches WHERE page_id = ${id}`)).rows[0]!;

export {
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
};
