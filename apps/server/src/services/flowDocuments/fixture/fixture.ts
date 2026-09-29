import type { FlowDocumentSaveV1Input, FlowPublicationV1 } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { flows } from "../../../db/tables/flows.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { IoCtx } from "../../support.ts";
import type { DocumentPublisher } from "../publisher";

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
	const db = await openTestDb();
	await db.insert(flows).values({
		id: flowId,
		slug: "review",
		name: "Review",
		description: "Review a proposed change.",
		briefing: "Read the ticket.",
		createdAt: new Date("2026-09-29T06:00:00Z"),
		updatedAt: new Date("2026-09-29T06:00:00Z"),
	});
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
	const logs: { message: string; fields?: Record<string, unknown> }[] = [];
	const io = {
		core: ctx,
		newTx: db.transaction.bind(db),
		emit: ctx.emit,
		log: (message: string, fields?: Record<string, unknown>) => {
			logs.push({ message, fields });
		},
	} as IoCtx;
	return { db, ctx, io, logs, run: db.transaction.bind(db) };
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
