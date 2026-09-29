import type { FlowDocumentSaveV1Input, FlowPublicationV1 } from "@trellis/api";
import { createCache } from "../../db/cache.ts";
import { documentFixture } from "../../db/queries/langflowDocuments/fixture.ts";
import type { ServiceCtx } from "../../context.ts";
import type { IoCtx } from "../support.ts";
import type { DocumentPublisher } from "./publisher.ts";

export const flowId = "00000000000000000000000001";
export const manifestHash = "c".repeat(64);
export const packageDigest = "d".repeat(64);

export const saveInput = (expectedVersion = 1): FlowDocumentSaveV1Input => ({
	flow: flowId,
	expectedVersion,
	requestId: crypto.randomUUID(),
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: { nodes: [], edges: [] },
	componentManifestHash: manifestHash,
});

export const serviceFixture = async () => {
	const db = await documentFixture();
	await db.$client.exec(`
		CREATE TABLE actors (name text, kind text, first_seen_at timestamptz, last_seen_at timestamptz, PRIMARY KEY(name, kind));
		CREATE TABLE flow_nodes (id text PRIMARY KEY, flow_id text, parent_id text, kind text, title text,
			instruction text, parallel boolean, minutes integer, max_rounds integer, harness jsonb, review_area text,
			x double precision, y double precision, width double precision, height double precision);
		CREATE TABLE flow_edges (id text PRIMARY KEY, flow_id text, from_node_id text, to_node_id text, branch text);
	`);
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "test" },
		session: null,
		reqId: "test",
		now: new Date("2026-09-29T08:00:00Z"),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	const io = { core: ctx, newTx: db.transaction.bind(db), emit: ctx.emit } as IoCtx;
	return { db, ctx, io, run: db.transaction.bind(db) };
};

export const publisher = (overrides: Partial<DocumentPublisher> = {}): DocumentPublisher => ({
	enginePackageDigest: packageDigest,
	componentManifestHash: manifestHash,
	validate: async () => [],
	publish: async ({ snapshot }) =>
		({
			publicationId: "00000000000000000000000002",
			flowId: snapshot.flow.id,
			revision: snapshot.revision,
			documentHash: snapshot.documentHash,
			engineFlowId: "550e8400-e29b-41d4-a716-446655440000",
			enginePackageDigest: packageDigest,
			componentManifestHash: manifestHash,
			publishedAt: "2026-09-29T08:01:00.000Z",
			conversion: null,
		}) satisfies FlowPublicationV1,
	...overrides,
});
