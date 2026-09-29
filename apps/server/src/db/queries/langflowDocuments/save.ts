import { createHash } from "node:crypto";
import type { Flow, FlowDiagnosticV1, FlowDocumentContentV1, FlowDocumentV1 } from "@trellis/api";
import { and, desc, eq, sql } from "drizzle-orm";
import { flows } from "../../tables/flows.ts";
import {
	langflowDocumentPublications,
	langflowDocumentRevisions,
	langflowDocumentSaveReceipts,
} from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";
import { iso, rows } from "../support.ts";

export type SaveDocumentInput = {
	flowId: string;
	expectedVersion: number;
	requestId: string;
	requestBytes: Buffer;
	sourceBytes: Buffer;
	content: FlowDocumentContentV1;
	diagnostics: FlowDiagnosticV1[];
	savedAt: Date;
};

export type SaveDocumentResult =
	| { state: "saved" | "replayed"; receipt: FlowDocumentV1 }
	| { state: "request_conflict"; requestId: string }
	| { state: "version_conflict"; version: number };

// The caller supplies validated content and its original bytes. The flow row lock
// serializes saves with metadata edits until the caller commits the transaction.
export const saveDocument = async (tx: Tx, input: SaveDocumentInput): Promise<SaveDocumentResult> => {
	const [current] = await rows<Flow>(
		tx,
		sql`
		SELECT f.id, p.key AS project, f.slug, f.name, f.description, f.briefing, f.harness, f.version,
			${iso(sql`f.created_at`)} AS "createdAt", ${iso(sql`f.updated_at`)} AS "updatedAt"
		FROM flows f LEFT JOIN projects p ON p.id = f.project_id
		WHERE f.id = ${input.flowId} FOR UPDATE OF f
	`,
	);
	const [previous] = await tx
		.select()
		.from(langflowDocumentSaveReceipts)
		.where(
			and(
				eq(langflowDocumentSaveReceipts.flowId, input.flowId),
				eq(langflowDocumentSaveReceipts.requestId, input.requestId),
			),
		);
	if (previous !== undefined) {
		return previous.requestBytes.equals(input.requestBytes)
			? { state: "replayed", receipt: previous.receipt }
			: { state: "request_conflict", requestId: input.requestId };
	}
	if (current!.version !== input.expectedVersion) return { state: "version_conflict", version: current!.version };

	const revision = current!.version + 1;
	const documentHash = createHash("sha256").update(input.sourceBytes).digest("hex");
	const flow = { ...current!, version: revision, updatedAt: input.savedAt.toISOString() };
	const snapshot = { ...input.content, flow, revision, documentHash, diagnostics: input.diagnostics };
	const [last] = await tx
		.select()
		.from(langflowDocumentPublications)
		.where(eq(langflowDocumentPublications.flowId, input.flowId))
		.orderBy(desc(langflowDocumentPublications.revision))
		.limit(1);
	const receipt: FlowDocumentV1 = {
		...snapshot,
		publication: { state: input.content.engine === "langflow" ? "pending" : "not_requested", revision },
		lastExecutablePublication: input.content.engine === "langflow" ? (last?.publication ?? null) : null,
	};

	await tx.update(flows).set({ version: revision, updatedAt: input.savedAt }).where(eq(flows.id, input.flowId));
	await tx.insert(langflowDocumentRevisions).values({
		flowId: input.flowId,
		revision,
		documentHash,
		componentManifestHash: input.content.componentManifestHash,
		sourceBytes: input.sourceBytes,
		snapshot,
		savedAt: input.savedAt,
	});
	await tx.insert(langflowDocumentSaveReceipts).values({
		flowId: input.flowId,
		requestId: input.requestId,
		requestBytes: input.requestBytes,
		revision,
		receipt,
		requestHash: createHash("sha256").update(input.requestBytes).digest("hex"),
	});
	return { state: "saved", receipt };
};
