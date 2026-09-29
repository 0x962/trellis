import { protocolDigest } from "../../../../../langflowContracts";
import { authorityPermitBinding } from "../../../../../langflowHost/authorityPermit";
import type { AuthorityCommit } from "../../../../../langflowHost/contracts";
import { now } from "../../fixtures/fixture";
import { recoveryFixture } from "./recoveryFixture";

export async function renewalFixture() {
	const fixture = await recoveryFixture(false, false);
	const original = JSON.parse(fixture.initial.authorityBytes);
	const request = {
		version: 1 as const,
		requestId: crypto.randomUUID(),
		executionId: original.executionId,
		ownerId: original.ownerId,
		engineEpoch: original.engineEpoch,
		expectedRevision: 1,
		supervisorObservationId: "observation-renewal",
	};
	const authority = {
		...original,
		ownershipRevision: 2,
		capabilityId: "renewed-capability",
		issuedAt: now.toISOString(),
		expiresAt: "2026-09-29T08:00:00Z",
	};
	const requestBytes = ` ${JSON.stringify(request)}\n`;
	const takeover: AuthorityCommit = {
		permit: {
			...fixture.initial.input.permit,
			id: crypto.randomUUID(),
			binding: authorityPermitBinding({ ...request, expiresAt: authority.expiresAt }, authority.engineJobId),
		},
		requestBytes,
		authorityBytes: ` ${JSON.stringify(authority)}\r\n`,
		receipt: {
			version: 1,
			request,
			requestDigest: protocolDigest(requestBytes),
			renewalId: crypto.randomUUID(),
			authority,
		},
		observation: {
			...fixture.initial.observation,
			id: request.supervisorObservationId,
			observedAt: authority.issuedAt,
		},
		revocation: null,
	};
	return { ...fixture, input: { ...fixture.input, takeover } };
}
