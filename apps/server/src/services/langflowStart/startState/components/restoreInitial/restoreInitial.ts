import { isDeepStrictEqual } from "node:util";
import { bindExecution, lockExecution } from "../../../../../db/queries/langflowExecution";
import type { Tx } from "../../../../../db/tx";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../../../langflowContracts";
import { InitialAuthorityRecordSchema } from "../../../../../langflowHost/initialAuthority/schema/schema";

export async function restoreInitial(tx: Tx, input: { executionId: string; initialRecordBytes: string }) {
	const row = await lockExecution(tx, input);
	const initial = InitialAuthorityRecordSchema.parse(JSON.parse(input.initialRecordBytes));
	const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(initial.authorityBytes));
	if (
		row.admission.state !== "closed" || row.submission.state === "failed" ||
		initial.input.executionId !== row.executionId || initial.input.hostId !== row.hostId ||
		initial.input.projectId !== row.projectId || initial.input.publicationId !== row.publicationId ||
		initial.input.publicationDigest !== row.publication.documentHash ||
		initial.input.submissionDigest !== protocolDigest(row.submissionBytes) ||
		authority.engineEpoch !== 1 || authority.ownershipRevision !== 1 ||
		authority.ownerId !== initial.observation.identity.ownerId || authority.hostId !== initial.observation.identity.hostId ||
		authority.issuedAt !== initial.observation.observedAt || authority.expiresAt !== initial.input.expiresAt ||
		!isDeepStrictEqual(authority.permissions, initial.input.permissions)
	) throw new Error("initial_binding_conflict");
	return bindExecution(tx, { executionId: row.executionId, correlation: initial.input.correlation, authority });
}
