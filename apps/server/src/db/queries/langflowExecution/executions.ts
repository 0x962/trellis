import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import {
	protocolDigest,
	type AdmissionReceiptV1,
	type CorrelationReceiptV1,
	type DeliveryAuthorityV1,
} from "../../../langflowContracts";
import { langflowExecutions, langflowOutbox } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { readStartRequest, saveStartRequest } from "./startRequests";

export async function readExecution(tx: Tx, input: { executionId: string }) {
	const [row] = await tx.select().from(langflowExecutions).where(eq(langflowExecutions.executionId, input.executionId));
	return row ?? null;
}
export async function lockExecution(tx: Tx, input: { executionId: string }) {
	const [row] = await tx
		.select()
		.from(langflowExecutions)
		.where(eq(langflowExecutions.executionId, input.executionId))
		.for("update");
	if (!row) throw new Error("execution_not_found");
	return row;
}
export async function reserveExecution(tx: Tx, input: typeof langflowExecutions.$inferInsert) {
	const prior = await readStartRequest(tx, input);
	if (prior) {
		if (prior.requestBytes !== input.requestBytes) throw new Error("identity_conflict");
		return (await readExecution(tx, prior))!;
	}
	if (
		input.admission.state !== "closed" ||
		input.correlation ||
		input.engineJobId ||
		input.engineSessionId ||
		input.authority ||
		input.cancelIntent ||
		input.submission.requestDigest !== protocolDigest(input.requestBytes) ||
		input.submission.submissionDigest !== protocolDigest(input.submissionBytes) ||
		input.submission.executionId !== input.executionId ||
		input.submission.publicationId !== input.publicationId ||
		input.publication.publicationId !== input.publicationId ||
		input.snapshot.flow.id !== input.flowId ||
		input.snapshot.revision !== input.publication.revision
	)
		throw new Error("execution_reservation_conflict");
	const [inserted] = await tx
		.insert(langflowExecutions)
		.values(input)
		.onConflictDoNothing({
			target: [langflowExecutions.actorKind, langflowExecutions.actorName, langflowExecutions.requestId],
		})
		.returning();
	if (inserted) {
		await saveStartRequest(tx, {
			actorKind: input.actorKind,
			actorName: input.actorName,
			requestId: input.requestId,
			requestBytes: input.requestBytes,
			executionId: input.executionId,
		});
		return inserted;
	}
	const [existing] = await tx
		.select()
		.from(langflowExecutions)
		.where(
			and(
				eq(langflowExecutions.actorKind, input.actorKind),
				eq(langflowExecutions.actorName, input.actorName),
				eq(langflowExecutions.requestId, input.requestId),
			),
		);
	if (existing!.requestBytes !== input.requestBytes) throw new Error("identity_conflict");
	return existing!;
}
export async function openAdmission(
	tx: Tx,
	input: {
		executionId: string;
		correlation: CorrelationReceiptV1;
		receipt: AdmissionReceiptV1;
		authority: DeliveryAuthorityV1;
	},
) {
	const row = await lockExecution(tx, input);
	if (row.cancelIntent) throw new Error("execution_canceled");
	const { correlation, receipt, authority } = input;
	if (
		correlation.executionId !== row.executionId ||
		correlation.hostId !== row.hostId ||
		correlation.publicationId !== row.publicationId ||
		correlation.submissionDigest !== protocolDigest(row.submissionBytes) ||
		receipt.executionId !== row.executionId ||
		receipt.publicationId !== row.publicationId ||
		receipt.engineJobId !== correlation.engineJobId ||
		receipt.submissionDigest !== correlation.submissionDigest ||
		authority.executionId !== row.executionId ||
		authority.publicationId !== row.publicationId ||
		authority.engineJobId !== correlation.engineJobId ||
		authority.engineEpoch !== receipt.engineEpoch ||
		authority.hostId !== row.hostId ||
		authority.projectId !== row.projectId ||
		authority.publicationDigest !== row.publication.documentHash ||
		(row.correlation !== null && !isDeepStrictEqual(row.correlation, correlation)) ||
		(row.authority !== null && !isDeepStrictEqual(row.authority, authority))
	)
		throw new Error("admission_conflict");
	if (row.admission.state === "open") {
		if (!isDeepStrictEqual(row.admission.receipt, receipt)) throw new Error("identity_conflict");
		return row;
	}
	const admission = { state: "open" as const, receipt };
	const [saved] = await tx
		.update(langflowExecutions)
		.set({
			correlation,
			engineJobId: correlation.engineJobId,
			engineSessionId: correlation.engineSessionId,
			admission,
			authority,
			submission: {
				...row.submission,
				state: "submitted",
				correlation,
				admission,
				revision: row.submission.revision + 1,
			},
			revision: row.revision + 1,
		})
		.where(eq(langflowExecutions.executionId, row.executionId))
		.returning();
	await tx.insert(langflowOutbox).values({
		id: receipt.admissionId,
		executionId: row.executionId,
		kind: "admission",
		payloadBytes: JSON.stringify(receipt),
	});
	return saved!;
}
export function assertAuthority(
	row: Awaited<ReturnType<typeof lockExecution>>,
	authority: DeliveryAuthorityV1,
	permission: DeliveryAuthorityV1["permissions"][number],
	now: Date,
) {
	const current = row.authority;
	if (
		!current ||
		!isDeepStrictEqual(current, authority) ||
		!current.permissions.includes(permission) ||
		Date.parse(current.expiresAt) <= now.getTime()
	)
		throw new Error("authority_conflict");
}
