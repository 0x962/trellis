import { createHash } from "node:crypto";
import type { Flow, FlowDocumentContentV1 } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import { insertDocumentRevision, readLatestDocumentRevision } from "../../db/queries/langflowDocuments";
import type { Tx } from "../../db/tx.ts";
import { legacySnapshot } from "./legacy.ts";
import { documentBytes } from "./documentBytes.ts";

export const captureMetadata = async (ctx: ServiceCtx, tx: Tx, flow: Flow) => {
	const latest = await readLatestDocumentRevision(tx, { flowId: flow.id });
	const snapshot =
		latest?.snapshot.engine === "langflow"
			? { ...latest.snapshot, flow, revision: flow.version }
			: await legacySnapshot(tx, flow);
	const { schemaVersion, engine, graphDocument, componentManifestHash } = snapshot;
	const content = { schemaVersion, engine, graphDocument, componentManifestHash } as FlowDocumentContentV1;
	const sourceBytes = documentBytes(content);
	await insertDocumentRevision(tx, {
		snapshot: { ...snapshot, documentHash: createHash("sha256").update(sourceBytes).digest("hex") },
		sourceBytes,
		savedAt: ctx.now,
	});
};
