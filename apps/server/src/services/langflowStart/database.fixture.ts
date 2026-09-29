import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { node } from "../../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { tableSql } from "../../db/queries/langflowExecution/fixtures/schema.ts";
import { langflowDocumentPublications, langflowDocumentRevisions } from "../../db/tables/langflowDocuments";
import {
	langflowExecutionProjections,
	langflowExecutions,
	langflowOutbox,
	langflowStartReceipts,
} from "../../db/tables/langflowExecution";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createFlow } from "../flows/flows.ts";
import { save as saveFlow } from "../flows/save.ts";
import { ensurePr } from "../reviews/queries.ts";
import { create as createTicket } from "../tickets/create.ts";
import { databaseStore } from "./databaseStore";
import { fixture } from "./fixture.ts";
import { reserve, type StartDependencies } from "./reserve.ts";

export async function databaseFixture() {
	const db = await openTestDb();
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	for (const table of [
		langflowDocumentRevisions,
		langflowDocumentPublications,
		langflowExecutions,
		langflowStartReceipts,
		langflowOutbox,
		langflowExecutionProjections,
	])
		await db.$client.exec(tableSql(table));
	const at = new Date("2026-09-29T06:00:00Z");
	const projectId = ulid();
	await db.execute(
		sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at) VALUES (${projectId},'START','start','Start',${at},${at})`,
	);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "test" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	const created = await run((tx) => createFlow(ctx, tx, { name: "Start", project: "START" }));
	const { flow } = await run((tx) =>
		saveFlow(ctx, tx, {
			flow: created.id,
			expectedVersion: created.version,
			nodes: [node(ulid(), "agent", null)],
			edges: [],
		}),
	);
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "START", title: "Start fixture" }));
	const diff = await run((tx) => ensurePr(tx, "example/start#1"));
	await db.execute(sql`UPDATE pull_requests SET head_sha=${"a".repeat(40)} WHERE id=${diff.id}`);
	await db.execute(
		sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at) VALUES (${ticket.id},${diff.id},'manual','test','human',${at})`,
	);
	const sample = fixture().initial;
	const sourceBytes = Buffer.from("immutable fixture graph");
	const documentHash = createHash("sha256").update(sourceBytes).digest("hex");
	const snapshot = { ...sample.snapshot, flow, revision: flow.version, documentHash };
	const publication = { ...sample.publication, flowId: flow.id, revision: flow.version, documentHash };
	await db.insert(langflowDocumentRevisions).values({
		flowId: flow.id,
		revision: flow.version,
		documentHash,
		componentManifestHash: publication.componentManifestHash,
		sourceBytes,
		snapshot,
		savedAt: at,
	});
	await db.insert(langflowDocumentPublications).values({
		publicationId: publication.publicationId,
		flowId: flow.id,
		revision: flow.version,
		documentHash,
		componentManifestHash: publication.componentManifestHash,
		publication,
	});
	const store = databaseStore(ctx);
	const deps: StartDependencies = {
		hostId: "host-1",
		store,
		requireCurrentPublication: async () => ({ snapshot, publication }),
	};
	const input = {
		flow: flow.id,
		ticket: ticket.id,
		diffId: diff.id,
		headSha: "a".repeat(40),
		expectedVersion: flow.version,
		requestId: crypto.randomUUID(),
	};
	return { db, run, ctx, input, store, deps, start: (request = input) => run((tx) => reserve(ctx, tx, request, deps)) };
}
