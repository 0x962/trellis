import { ORPCError } from "@orpc/server";
import type { PublishDocumentV1Input } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../../context";
import { claimDocumentAction, readDocumentAction, readDocumentRevision } from "../../../../../db/queries/langflowDocuments";
import type { Tx } from "../../../../../db/tx";
import { fail, invalidInput } from "../../../../../errors";
import { resolveFlow } from "../../../../flows/flows";

export const capturePublication = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: PublishDocumentV1Input,
	requestBytes: string,
	checkInstalled: () => void,
) => {
	await tx.execute(sql`SELECT id FROM flows WHERE id = ${input.flowId} FOR UPDATE`);
	const previous = await readDocumentAction(tx, input);
	if (previous && (previous.action !== "publish" || previous.requestBytes !== requestBytes))
		throw new ORPCError("FLOW_REQUEST_CONFLICT", {
			status: 409, defined: true, message: "This request ID already identifies different publication bytes.",
			data: { requestId: input.requestId },
		});
	if (previous?.document) return { state: "completed" as const, document: previous.document };
	if (!previous) {
		const flow = await resolveFlow(tx, input.flowId);
		if (flow.version !== input.expectedVersion) throw fail("FLOW_VERSION_CONFLICT", { version: flow.version });
		checkInstalled();
	}
	const stored = await readDocumentRevision(tx, { flowId: input.flowId, revision: input.expectedVersion });
	if (stored?.snapshot.engine !== "langflow") throw invalidInput("flowId", "Publish a saved Langflow document.");
	if (stored.documentHash !== input.expectedDocumentHash || stored.componentManifestHash !== input.componentManifestHash)
		throw invalidInput("expectedDocumentHash", "The saved document does not match the publication request.");
	if (!previous) {
		const claimed = await claimDocumentAction(tx, {
			flowId: input.flowId, requestId: input.requestId, action: "publish",
			requestBytes, revision: input.expectedVersion, createdAt: ctx.now,
		});
		if (claimed.state !== "claimed") throw new Error("publication_claim_conflict");
	}
	return {
		state: "captured" as const,
		replay: previous !== null,
		base: { snapshot: stored.snapshot, sourceBytes: stored.sourceBytes },
	};
};
