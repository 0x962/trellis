import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { protocolDigest, type RenewalReceiptV1, type TakeoverReceiptV1 } from "../../../langflowContracts";
import { langflowExecutions, langflowOutbox, langflowOwnershipReceipts } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
import { assertOwnerActive } from "./ownerFence";

export async function transferOwnership(
	tx: Tx,
	input: { requestBytes: string; receipt: TakeoverReceiptV1 | RenewalReceiptV1 },
) {
	const { receipt } = input;
	const row = await lockExecution(tx, receipt.request);
	const [existing] = await tx
		.select()
		.from(langflowOwnershipReceipts)
		.where(
			and(
				eq(langflowOwnershipReceipts.executionId, row.executionId),
				eq(langflowOwnershipReceipts.requestId, receipt.request.requestId),
			),
		);
	await assertOwnerActive(tx, existing?.receipt.authority ?? receipt.authority);
	if (row.cancelIntent) {
		if (row.admission.state !== "closed" || !isDeepStrictEqual(row.submission.admission, row.admission))
			throw new Error("canceled_admission_open");
		const retained = existing?.receipt ?? receipt;
		const permissions = retained.authority.permissions;
		if (permissions.length !== 1 || permissions[0] !== "execution.cancel")
			throw new Error("cancellation_requires_successor_authority");
		if ("transferId" in retained && !isDeepStrictEqual(retained.admission, row.admission))
			throw new Error("admission_conflict");
	}
	if (existing) {
		if (existing.requestBytes !== input.requestBytes) throw new Error("identity_conflict");
		return existing.receipt;
	}
	if (
		receipt.requestDigest !== protocolDigest(input.requestBytes) ||
		!isDeepStrictEqual(JSON.parse(input.requestBytes), receipt.request)
	)
		throw new Error("ownership_request_conflict");
	const current = row.authority;
	const next = receipt.authority;
	if (
		!current ||
		receipt.request.expectedRevision !== current.ownershipRevision ||
		next.executionId !== row.executionId ||
		next.publicationId !== row.publicationId ||
		next.engineJobId !== row.engineJobId ||
		next.hostId !== row.hostId ||
		next.projectId !== row.projectId ||
		next.publicationDigest !== current.publicationDigest ||
		next.ownershipRevision !== current.ownershipRevision + 1
	)
		throw new Error("ownership_conflict");
	const takeover = "transferId" in receipt;
	if (
		takeover
			? receipt.request.expectedOwnerId !== current.ownerId ||
				receipt.request.expectedEpoch !== current.engineEpoch ||
				next.engineEpoch !== current.engineEpoch + 1 ||
				next.ownerId !== receipt.request.newOwnerId
			: receipt.request.ownerId !== current.ownerId ||
				receipt.request.engineEpoch !== current.engineEpoch ||
				next.engineEpoch !== current.engineEpoch ||
				next.ownerId !== current.ownerId
	)
		throw new Error("ownership_conflict");
	const admission = takeover ? receipt.admission : row.admission;
	if (
		admission.state !== row.admission.state ||
		(admission.state === "open" &&
			(admission.receipt.executionId !== row.executionId ||
				admission.receipt.publicationId !== row.publicationId ||
				admission.receipt.engineJobId !== row.engineJobId ||
				admission.receipt.engineEpoch !== next.engineEpoch ||
				admission.receipt.submissionDigest !== protocolDigest(row.submissionBytes)))
	)
		throw new Error("admission_conflict");
	await tx.insert(langflowOwnershipReceipts).values({
		id: takeover ? receipt.transferId : receipt.renewalId,
		executionId: row.executionId,
		requestId: receipt.request.requestId,
		requestBytes: input.requestBytes,
		receipt,
	});
	await tx
		.update(langflowExecutions)
		.set({
			authority: next,
			admission,
			revision: row.revision + 1,
			submission: { ...row.submission, admission, revision: row.submission.revision + 1 },
		})
		.where(eq(langflowExecutions.executionId, row.executionId));
	if (takeover && admission.state === "open")
		await tx.insert(langflowOutbox).values({
			id: admission.receipt.admissionId,
			executionId: row.executionId,
			kind: "admission",
			payloadBytes: JSON.stringify(admission.receipt),
		});
	return receipt;
}
