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
import { reserveWatchBatch, WATCH_LEASE_MS } from "../watchBatch";
import { watch } from "../watches.ts";

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

export { agentId, at, cache, core, ctx, db, directory, fixture, later, otherId, projectId, row, tx };
