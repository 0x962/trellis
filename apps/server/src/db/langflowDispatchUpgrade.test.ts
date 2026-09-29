import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { FlowDocSchema, FlowDocumentV1Schema, FlowExecutionSchema, FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { node } from "../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../context.ts";
import type { GhAccess } from "../ghState.ts";
import { type ProcedureContext, router } from "../procedures/index.ts";
import { createDbTiming } from "../serverTiming.ts";
import * as flows from "../services/flows/flows.ts";
import { services } from "../services/registry.ts";
import { create as createTicket } from "../services/tickets/create.ts";
import { createCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import type { ServiceTransport } from "./transport.ts";

let db: Db;
let ctx: ServiceCtx;
let flowId: string;
let ticketId: string;
let directory: string;
const migrationsFolder = join(import.meta.dir, "../../drizzle");
const originalNode = node(ulid(), "agent", null);

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-dispatch-upgrade-"));
	await mkdir(join(directory, "meta"));
	const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
	const entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 131);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	const projectId = ulid();
	const now = new Date("2026-09-29T06:00:00Z");
	await db.execute(sql`INSERT INTO projects(id,key,slug,name,created_at,updated_at)
		VALUES(${projectId},'UPG','upg','Upgrade',${now},${now})`);
	await db.execute(sql`INSERT INTO statuses(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES(${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${now},${now})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		reqId: "upgrade",
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const flow = await db.transaction((tx) => flows.create(ctx, tx, { name: "Upgrade", project: "UPG" }));
	flowId = flow.id;
	await db.transaction((tx) =>
		flows.save(ctx, tx, { flow: flowId, expectedVersion: 1, nodes: [originalNode], edges: [] }),
	);
	const ticket = await db.transaction((tx) => createTicket(ctx, tx, { project: "UPG", title: "Retain this ticket" }));
	ticketId = ticket.id;
	const absent = await db.execute(sql`SELECT to_regclass('langflow_executions') AS name`);
	expect(absent.rows[0]!.name).toBeNull();
	expect(await migrate(db)).toBeGreaterThanOrEqual(3);
}, 60_000);

afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

const handler = new OpenAPIHandler<ProcedureContext>(router);
async function request(path: string, method = "GET", body?: unknown) {
	const raw = new Request(`http://localhost/api${path}`, {
		method,
		headers: { "content-type": "application/json", "x-trellis-actor": "human:fixture" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const call: ServiceTransport["call"] = (name, requestCtx, input) => {
		const entry = services[name];
		if (entry.family !== "core") throw new Error(`Expected core service ${name}`);
		return db.transaction((tx) => entry.run({ ...ctx, ...requestCtx }, tx, input));
	};
	const result = await handler.handle(raw, {
		prefix: "/api",
		context: {
			headers: raw.headers,
			reqId: "upgrade",
			transport: { call } as ServiceTransport,
			actor: null,
			timing: createDbTiming(),
			chooseDirectory: async () => null,
			gh: {} as GhAccess,
		},
	});
	expect(result.matched).toBe(true);
	return result.response!;
}

test("an upgrade from 0131 preserves legacy read, edit, start and versioned reads", async () => {
	const read = await request(`/flows/${flowId}`);
	expect(read.status).toBe(200);
	const original = FlowDocSchema.parse(await read.json());
	expect(original.nodes[0]!.id).toBe(originalNode.id);
	const saved = await request(`/flows/${flowId}/graph`, "PUT", {
		flow: flowId,
		expectedVersion: original.flow.version,
		nodes: [originalNode],
		edges: [],
	});
	expect(saved.status).toBe(200);
	const doc = FlowDocSchema.parse(await saved.json());
	const started = await request("/flow-executions", "POST", {
		flow: flowId,
		ticket: ticketId,
		expectedVersion: doc.flow.version,
		requestId: crypto.randomUUID(),
	});
	expect(started.status).toBe(200);
	const execution = FlowExecutionSchema.parse(await started.json());
	const view = await request(`/flow-executions/${execution.id}/view-v1`);
	expect(view.status).toBe(200);
	expect(FlowExecutionViewV1Schema.parse(await view.json()).engine).toBe("legacy");
	const document = await request(`/flows/${flowId}/document-v1`);
	expect(document.status).toBe(200);
	expect(FlowDocumentV1Schema.parse(await document.json()).engine).toBe("legacy");
	const index = await request(`/flow-executions/index-v1?limit=501&flow=${flowId}`);
	expect(index.status).toBe(200);
	expect(await index.json()).toEqual([{ id: execution.id, engine: "legacy" }]);
});
