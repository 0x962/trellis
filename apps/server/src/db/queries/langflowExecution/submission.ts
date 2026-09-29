import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import {
	type AdmissionReceiptV1,
	type CorrelationReceiptV1,
	type DeliveryAuthorityV1,
	protocolDigest,
} from "../../../langflowContracts";
import { langflowExecutions, langflowOutbox } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
import { assertOwnerActive } from "./ownerFence";
export async function bindExecution(
	tx: Tx,
	input: { executionId: string; correlation: CorrelationReceiptV1; authority: DeliveryAuthorityV1 },
) {
	const row = await lockExecution(tx, input);
	await assertOwnerActive(tx, row.authority ?? input.authority);
	if (row.correlation) {
		if (!isDeepStrictEqual(row.correlation, input.correlation)) throw new Error("identity_conflict");
		return row;
	}
	const { correlation, authority } = input;
	if (
		correlation.executionId !== row.executionId ||
		correlation.hostId !== row.hostId ||
		correlation.publicationId !== row.publicationId ||
		correlation.submissionDigest !== protocolDigest(row.submissionBytes) ||
		authority.executionId !== row.executionId ||
		authority.publicationId !== row.publicationId ||
		authority.hostId !== row.hostId ||
		authority.projectId !== row.projectId ||
		authority.engineJobId !== correlation.engineJobId ||
		authority.publicationDigest !== row.publication.documentHash
	)
		throw new Error("correlation_conflict");
	const [saved] = await tx
		.update(langflowExecutions)
		.set({
			correlation,
			engineJobId: correlation.engineJobId,
			engineSessionId: correlation.engineSessionId,
			authority,
			submission: { ...row.submission, correlation, state: "submitted", revision: row.submission.revision + 1 },
			revision: row.revision + 1,
		})
		.where(eq(langflowExecutions.executionId, row.executionId))
		.returning();
	return saved!;
}
export async function markSubmissionUnknown(tx: Tx, input: { executionId: string }) {
	const row = await lockExecution(tx, input);
	if (row.correlation || row.admission.state === "open" || row.cancelIntent) return row;
	const [saved] = await tx
		.update(langflowExecutions)
		.set({
			submission: { ...row.submission, state: "submission_unknown", revision: row.submission.revision + 1 },
			revision: row.revision + 1,
		})
		.where(eq(langflowExecutions.executionId, row.executionId))
		.returning();
	return saved!;
}

export async function confirmAdmission(tx: Tx, input: { executionId: string; receipt: AdmissionReceiptV1 }) {
	await lockExecution(tx, input);
	const [record] = await tx
		.select()
		.from(langflowOutbox)
		.where(
			and(
				eq(langflowOutbox.executionId, input.executionId),
				eq(langflowOutbox.kind, "admission"),
				eq(langflowOutbox.id, input.receipt.admissionId),
			),
		);
	if (!record || !isDeepStrictEqual(JSON.parse(record.payloadBytes), input.receipt))
		throw new Error("admission_receipt_conflict");
	await tx
		.update(langflowOutbox)
		.set({ receipt: input.receipt })
		.where(and(eq(langflowOutbox.kind, "admission"), eq(langflowOutbox.id, input.receipt.admissionId)));
}
