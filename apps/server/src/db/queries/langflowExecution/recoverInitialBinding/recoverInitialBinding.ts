import { isDeepStrictEqual } from "node:util";
import { eq } from "drizzle-orm";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../../langflowContracts";
import type { AuthorityCommit } from "../../../../langflowHost/contracts";
import { InitialAuthorityRecordSchema } from "../../../../langflowHost/initialAuthority/schema/schema";
import { langflowExecutions } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";
import { authorityControl } from "../authorityControl";
import { lockExecution } from "../executions";
import { assertOwnerActive, lockOwners } from "../ownerFence";

export type InitialBindingCommit = AuthorityCommit & { initialRecordBytes: string };
export type RecoverInitialBindingInput = { initialRecordBytes: string; takeover: AuthorityCommit };

export async function recoverInitialBinding(
	tx: Tx,
	input: RecoverInitialBindingInput,
): Promise<InitialBindingCommit> {
	const initial = InitialAuthorityRecordSchema.parse(JSON.parse(input.initialRecordBytes));
	const original = DeliveryAuthorityV1Schema.parse(JSON.parse(initial.authorityBytes));
	const { takeover } = input;
	const { receipt, observation, revocation } = takeover;
	const row = await lockExecution(tx, receipt.request);
	const isTakeover = "transferId" in receipt;
	const correlation = initial.input.correlation;
	const identity = initial.observation.identity;
	if (
		initial.input.executionId !== row.executionId ||
		initial.input.hostId !== row.hostId ||
		initial.input.projectId !== row.projectId ||
		initial.input.publicationId !== row.publicationId ||
		initial.input.publicationDigest !== row.publication.documentHash ||
		initial.input.submissionDigest !== protocolDigest(row.submissionBytes) ||
		correlation.executionId !== row.executionId ||
		correlation.hostId !== row.hostId ||
		correlation.publicationId !== row.publicationId ||
		correlation.submissionDigest !== initial.input.submissionDigest ||
		original.executionId !== row.executionId ||
		original.hostId !== row.hostId ||
		original.projectId !== row.projectId ||
		original.publicationId !== row.publicationId ||
		original.publicationDigest !== initial.input.publicationDigest ||
		original.engineJobId !== correlation.engineJobId ||
		original.engineEpoch !== 1 ||
		original.ownershipRevision !== 1 ||
		original.ownerId !== identity.ownerId ||
		original.hostId !== identity.hostId ||
		original.issuedAt !== initial.observation.observedAt ||
		original.expiresAt !== initial.input.expiresAt ||
		!isDeepStrictEqual(original.permissions, initial.input.permissions) ||
		observation.identity.dataHomeId !== identity.dataHomeId ||
		observation.identity.hostId !== identity.hostId ||
		receipt.request.expectedRevision !== original.ownershipRevision ||
		initial.input.permit.dataHomeId !== identity.dataHomeId ||
		initial.input.permit.binding.executionId !== row.executionId
	)
		throw new Error("initial_recovery_identity_conflict");
	if ("transferId" in receipt) {
		if (
			!revocation || !isDeepStrictEqual(revocation.identity, identity) ||
			observation.identity.ownerId === identity.ownerId ||
			receipt.request.expectedOwnerId !== original.ownerId ||
			receipt.request.expectedEpoch !== original.engineEpoch
		)
			throw new Error("initial_recovery_identity_conflict");
	} else if (
		revocation !== null || !isDeepStrictEqual(observation.identity, identity) ||
		receipt.request.ownerId !== original.ownerId || receipt.request.engineEpoch !== original.engineEpoch
	)
		throw new Error("initial_recovery_identity_conflict");
	await lockOwners(tx, [original, receipt.authority]);
	await assertOwnerActive(tx, receipt.authority);
	if (isTakeover && !isDeepStrictEqual(await authorityControl.readRevocation(tx, identity), revocation))
		throw new Error("owner_revocation_conflict");
	const commit: InitialBindingCommit = { ...takeover, initialRecordBytes: input.initialRecordBytes };
	const saved = await authorityControl.readReceipt(tx, receipt.request);
	if (saved) {
		if (!isDeepStrictEqual(saved, commit)) throw new Error("identity_conflict");
		return saved as InitialBindingCommit;
	}
	if (
		row.authority !== null ||
		row.correlation !== null ||
		row.engineJobId !== null ||
		row.engineSessionId !== null ||
		row.submission.correlation !== null ||
		row.submission.state === "failed" ||
		row.admission.state !== "closed" ||
		!isDeepStrictEqual(row.submission.admission, row.admission) ||
		("transferId" in receipt && !isDeepStrictEqual(receipt.admission, row.admission))
	)
		throw new Error("initial_recovery_binding_conflict");
	await tx
		.update(langflowExecutions)
		.set({
			correlation,
			engineJobId: correlation.engineJobId,
			engineSessionId: correlation.engineSessionId,
			authority: original,
			submission: { ...row.submission, correlation, state: "submitted", revision: row.submission.revision + 1 },
			revision: row.revision + 1,
		})
		.where(eq(langflowExecutions.executionId, row.executionId));
	return (await authorityControl.commit(tx, commit)) as InitialBindingCommit;
}
