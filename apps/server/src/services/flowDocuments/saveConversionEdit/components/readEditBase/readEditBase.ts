import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../../context";
import { readDocumentRevision, readDocumentSaveReceipt } from "../../../../../db/queries/langflowDocuments";
import type { Tx } from "../../../../../db/tx";
import { fail, invalidInput } from "../../../../../errors";
import { resolveFlow } from "../../../../flows/flows";
import type { ConversionEditIntentV1 } from "../../../../langflowMigration";

export async function readEditBase(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { intent: ConversionEditIntentV1; intentBytes: Buffer },
) {
	const { intent, intentBytes } = input;
	await tx.execute(sql`SELECT id FROM flows WHERE id = ${intent.flowId} FOR UPDATE`);
	const previous = await readDocumentSaveReceipt(tx, intent);
	if (previous) {
		if (!previous.requestBytes.equals(intentBytes))
			throw new ORPCError("FLOW_REQUEST_CONFLICT", {
				status: 409,
				message: "This request ID already identifies different edit bytes.",
				defined: true,
				data: { requestId: intent.requestId },
			});
		return { state: "replayed" as const, document: previous.receipt };
	}
	const flow = await resolveFlow(tx, intent.flowId);
	if (flow.version !== intent.expectedVersion) throw fail("FLOW_VERSION_CONFLICT", { version: flow.version });
	const base = await readDocumentRevision(tx, { flowId: flow.id, revision: flow.version });
	if (base?.snapshot.engine !== "langflow") throw invalidInput("flowId", "Edit an existing Langflow document.");
	if (base.documentHash !== intent.expectedDocumentHash)
		throw invalidInput("expectedDocumentHash", "The saved document does not match the edit base.");
	if (base.componentManifestHash !== intent.componentManifestHash)
		throw invalidInput("componentManifestHash", "The saved document uses a different component manifest.");
	return {
		state: "captured" as const,
		base: { snapshot: base.snapshot, sourceBytes: base.sourceBytes },
	};
}
