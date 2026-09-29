import { ORPCError } from "@orpc/server";
import type { ActivateConversionV1Input } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../../context";
import { readDocumentRevision, readDocumentSaveReceipt } from "../../../../../db/queries/langflowDocuments";
import type { Tx } from "../../../../../db/tx";
import { fail, invalidInput } from "../../../../../errors";
import { resolveFlow } from "../../../../flows/flows";
import { retainCurrent } from "../../../retainCurrent";

export const captureConversion = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: ActivateConversionV1Input,
	requestBytes: Buffer,
) => {
	await tx.execute(sql`SELECT id FROM flows WHERE id = ${input.flowId} FOR UPDATE`);
	const previous = await readDocumentSaveReceipt(tx, input);
	if (previous) {
		if (!previous.requestBytes.equals(requestBytes))
			throw new ORPCError("FLOW_REQUEST_CONFLICT", {
				status: 409,
				defined: true,
				message: "This request ID already identifies different conversion bytes.",
				data: { requestId: input.requestId },
			});
		return { state: "replayed" as const, document: previous.receipt };
	}
	const flow = await resolveFlow(tx, input.flowId);
	if (flow.version !== input.expectedVersion) throw fail("FLOW_VERSION_CONFLICT", { version: flow.version });
	await retainCurrent(ctx, tx, flow);
	const current = (await readDocumentRevision(tx, { flowId: flow.id, revision: flow.version }))!;
	if (current.snapshot.engine !== "legacy") throw invalidInput("flowId", "Convert an existing legacy document.");
	if (current.documentHash !== input.expectedDocumentHash)
		throw invalidInput("expectedDocumentHash", "The saved document does not match the conversion request.");
	return { state: "captured" as const, base: { snapshot: current.snapshot, sourceBytes: current.sourceBytes } };
};
