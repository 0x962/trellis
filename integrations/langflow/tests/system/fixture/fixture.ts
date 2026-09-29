import type { FlowDocumentSaveV1Input, FlowExecutionStartInput, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type ServiceCtx, SYSTEM_ACTOR } from "../../../../../apps/server/src/context.ts";
import { createCache } from "../../../../../apps/server/src/db/cache.ts";
import { openTestDb } from "../../../../../apps/server/src/db/testDb.ts";
import { type Tx, withTx } from "../../../../../apps/server/src/db/tx.ts";
import { get, publishDocument, save } from "../../../../../apps/server/src/services/flowDocuments";
import {
	manifestHash,
	publisher,
	seedLangflowDocument,
} from "../../../../../apps/server/src/services/flowDocuments/fixture";
import { create as createFlow } from "../../../../../apps/server/src/services/flows/flows.ts";
import { getView, initialize } from "../../../../../apps/server/src/services/langflowProjection";
import { reserveStart } from "../../../../../apps/server/src/services/langflowStart";
import { ensurePr } from "../../../../../apps/server/src/services/reviews/queries.ts";
import type { IoCtx } from "../../../../../apps/server/src/services/support.ts";
import { create as createTicket } from "../../../../../apps/server/src/services/tickets/create.ts";

export async function fixture() {
	const db = await openTestDb();
	const now = new Date("2026-09-29T06:30:00.000Z");
	const projectId = ulid();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${projectId},'SYSTEM','system','System fixtures',${now},${now})`);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${now},${now})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		reqId: ulid(),
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const events: TrellisEvent[] = [];
	const run = async <T>(action: (context: ServiceCtx, tx: Tx) => Promise<T>, context = ctx) =>
		(
			await withTx(
				db,
				(tx, emit) => action({ ...context, emit }, tx),
				(batch) => {
					events.push(...batch);
				},
			)
		).result;
	const flow = await run((context, tx) => createFlow(context, tx, { name: "System fixture", project: "SYSTEM" }));
	await run((_context, tx) => seedLangflowDocument(tx, { flow, savedAt: now }));
	const ticket = await run((context, tx) => createTicket(context, tx, { project: "SYSTEM", title: "System fixture" }));
	const diff = await run((_context, tx) => ensurePr(tx, "example/system#1"));
	await db.execute(sql`UPDATE pull_requests SET head_sha=${"a".repeat(40)} WHERE id=${diff.id}`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
		VALUES (${ticket.id},${diff.id},'manual','fixture','human',${now})`);
	const saveInput: FlowDocumentSaveV1Input = {
		flow: flow.id,
		expectedVersion: flow.version,
		requestId: crypto.randomUUID(),
		schemaVersion: 1,
		engine: "langflow",
		graphDocument: { nodes: [], edges: [] },
		componentManifestHash: manifestHash,
	};
	const input: FlowExecutionStartInput = {
		flow: flow.id,
		ticket: ticket.id,
		diffId: diff.id,
		headSha: "a".repeat(40),
		expectedVersion: flow.version + 1,
		requestId: crypto.randomUUID(),
	};
	const reserveAndInitialize = async (context: ServiceCtx, tx: Tx, request = input) => {
		const reservation = await reserveStart(context, tx, request, { hostId: "system-fixture-host" });
		if (reservation.execution.engine === "langflow")
			await initialize({ ...context, actor: SYSTEM_ACTOR }, tx, { executionId: reservation.execution.executionId });
		return reservation;
	};
	const io: IoCtx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		home: import.meta.dir,
		version: "fixture",
		apiVersion: "1",
		bootId: ulid(),
		now: () => now,
		ghStatus: () => ({ ok: true, user: "fixture", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		afterCommit: () => {},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: () => {},
		core: ctx,
		newTx: db.transaction.bind(db),
		emit: (event: TrellisEvent) => {
			events.push(event);
		},
		log: () => {},
	};
	return {
		db,
		ctx,
		run,
		events,
		flow,
		ticket,
		diff,
		input,
		saveInput,
		reserveAndInitialize,
		system: { ...ctx, actor: SYSTEM_ACTOR },
		save: (request = saveInput) => run((context, tx) => save(context, tx, request)),
		publish: (revision = input.expectedVersion) => publishDocument(io, { flow: flow.id, revision }, publisher()),
		start: (request = input) => run((context, tx) => reserveAndInitialize(context, tx, request)),
		document: () => run((context, tx) => get(context, tx, { flow: flow.id })),
		view: (id: string) => run((context, tx) => getView(context, tx, { id })),
	};
}
