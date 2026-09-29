import { protocolDigest } from "../../../../../langflowContracts";
import { authorityPermitBinding } from "../../../../../langflowHost/authorityPermit";
import type { AuthorityCommit, SidecarIdentity } from "../../../../../langflowHost/contracts";
import type { InitialAuthorityRecord } from "../../../../../langflowHost/initialAuthority/schema/schema";
import type { Db } from "../../../../client";
import { migrate } from "../../../../migrate";
import { authorityControl } from "../../authorityControl";
import { ids, jobId, now, receiptFixture, submissionBytes } from "../../fixtures/fixture";
import { beforeDocuments } from "../../fixtures/migration";

export async function recoveryFixture(open = false, revoke = true) {
	const db: Db = await beforeDocuments(140);
	await migrate(db);
	const original = await receiptFixture(open, db);
	const identity: SidecarIdentity = {
		dataHomeId: "home-1",
		hostId: "host-1",
		ownerId: "owner-1",
		instanceId: "instance-1",
		manifestDigest: "a".repeat(64),
	};
	const correlation = {
		version: 1 as const,
		hostId: identity.hostId,
		executionId: ids.execution,
		publicationId: ids.publication,
		submissionDigest: protocolDigest(submissionBytes),
		engineJobId: jobId,
		engineSessionId: "session-1",
		recordedAt: now.toISOString(),
	};
	const initial: InitialAuthorityRecord = {
		version: 1,
		issuanceReceiptId: crypto.randomUUID(),
		input: {
			executionId: ids.execution,
			hostId: identity.hostId,
			projectId: ids.project,
			publicationId: ids.publication,
			publicationDigest: original.authority.publicationDigest,
			submissionDigest: correlation.submissionDigest,
			correlation,
			expiresAt: original.authority.expiresAt,
			permissions: original.authority.permissions,
			permit: {
				id: crypto.randomUUID(),
				dataHomeId: identity.dataHomeId,
				generation: 1,
				binding: {
					effectId: "initial-1",
					kind: "admission",
					executionId: ids.execution,
					attemptId: null,
					jobId,
					requestId: original.input.requestId,
					payloadDigest: correlation.submissionDigest,
				},
			},
		},
		observation: {
			id: "observation-1",
			identity,
			observedAt: original.authority.issuedAt,
			endpoint: "http://127.0.0.1:4000",
		},
		authorityBytes: ` ${JSON.stringify(original.authority)}\r\n`,
	};
	const revocation = revoke ? await db.transaction((tx) =>
		authorityControl.revokeOwner(tx, { identity, observationId: "retire-1" }),
	) : null;
	const request = {
		version: 1 as const,
		executionId: ids.execution,
		requestId: crypto.randomUUID(),
		expectedOwnerId: identity.ownerId,
		expectedEpoch: 1,
		expectedRevision: 1,
		newOwnerId: "owner-2",
		supervisorObservationId: "observation-2",
		priorOwnerRevocationId: revocation?.id ?? "unused",
	};
	const authority = {
		...original.authority,
		ownerId: request.newOwnerId,
		engineEpoch: 2,
		ownershipRevision: 2,
		capabilityId: "capability-2",
		issuedAt: now.toISOString(),
	};
	const requestBytes = ` ${JSON.stringify(request)}\n`;
	const takeover: AuthorityCommit = {
		permit: {
			id: crypto.randomUUID(),
			dataHomeId: identity.dataHomeId,
			generation: 2,
			binding: authorityPermitBinding({ ...request, expiresAt: authority.expiresAt }, jobId),
		},
		requestBytes,
		authorityBytes: ` ${JSON.stringify(authority)}\n`,
		receipt: {
			version: 1,
			request,
			requestDigest: protocolDigest(requestBytes),
			transferId: crypto.randomUUID(),
			committedAt: now.toISOString(),
			authority,
			admission: original.input.admission,
		},
		observation: {
			id: request.supervisorObservationId,
			identity: { ...identity, ownerId: request.newOwnerId, instanceId: "instance-2" },
			observedAt: now.toISOString(),
			endpoint: "http://127.0.0.1:4001",
		},
		revocation,
	};
	return { db, initial, input: { initialRecordBytes: ` ${JSON.stringify(initial)}\n`, takeover } };
}
