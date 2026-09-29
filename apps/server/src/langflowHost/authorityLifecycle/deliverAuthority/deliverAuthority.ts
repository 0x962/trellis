import { z } from "zod";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../langflowContracts";
import type { createEngineClient, EngineResponse } from "../../engineClient";
import type { AuthorityPlan } from "../intentStore";

const StateSchema = z.strictObject({
	authorityBytes: z.string().min(1),
	authorityDigest: z.string().regex(/^[a-f0-9]{64}$/),
	authority: z.unknown(),
	revokedAt: z.string().nullable(),
});

type Client = ReturnType<typeof createEngineClient>;
type Result = { state: "confirmed"; sourceBytes: string } | { state: "unknown" | "absent" };

function stateOf(response: EngineResponse) {
	if (response.state !== "received" || response.status !== 200) return null;
	const sourceBytes = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
	const state = StateSchema.parse(JSON.parse(sourceBytes));
	if (protocolDigest(state.authorityBytes) !== state.authorityDigest)
		throw new Error("engine_authority_digest_conflict");
	DeliveryAuthorityV1Schema.parse(JSON.parse(state.authorityBytes));
	return { ...state, sourceBytes };
}

export async function deliverAuthority(input: {
	client: Client;
	plan: AuthorityPlan;
	authorityBytes: string;
	signal: AbortSignal;
}): Promise<Result> {
	const { client, plan, authorityBytes, signal } = input;
	const prior = DeliveryAuthorityV1Schema.parse(JSON.parse(plan.priorAuthorityBytes));
	const path = `/trellis-v1/authority/${encodeURIComponent(prior.executionId)}` as const;
	const observed = await client.request({ method: "GET", path, signal });
	if (observed.state === "received" && observed.status === 404) return { state: "absent" };
	let current = stateOf(observed);
	if (!current) return { state: "unknown" };
	if (current.authorityBytes === authorityBytes && current.revokedAt === null) {
		return { state: "confirmed", sourceBytes: current.sourceBytes };
	}
	if (current.authorityBytes !== plan.priorAuthorityBytes) throw new Error("engine_authority_predecessor_conflict");
	if ("expectedOwnerId" in plan.intent) {
		if (current.revokedAt === null) {
			const revoked = await client.request({
				method: "POST",
				path: "/trellis-v1/authority/revoke",
				body: JSON.stringify({
					executionId: prior.executionId,
					expectedCapabilityId: prior.capabilityId,
					revokedAt: plan.revokedAt,
				}),
				signal,
			});
			if (revoked.state !== "received" || revoked.status !== 200) return { state: "unknown" };
			current = stateOf(await client.request({ method: "GET", path, signal }));
			if (!current) return { state: "unknown" };
		}
		if (current.authorityBytes !== plan.priorAuthorityBytes || current.revokedAt === null) {
			throw new Error("engine_authority_revocation_conflict");
		}
	} else if (current.revokedAt !== null) throw new Error("engine_authority_revoked");
	const committed = await client.request({
		method: "POST",
		path: "/trellis-v1/authority/commit",
		body: JSON.stringify({ authorityBytes, expectedCapabilityId: prior.capabilityId }),
		signal,
	});
	if (committed.state !== "received" || committed.status !== 200) return { state: "unknown" };
	const confirmed = stateOf(await client.request({ method: "GET", path, signal }));
	if (!confirmed) return { state: "unknown" };
	if (confirmed.authorityBytes !== authorityBytes || confirmed.revokedAt !== null) {
		throw new Error("engine_authority_acknowledgement_conflict");
	}
	return { state: "confirmed", sourceBytes: confirmed.sourceBytes };
}
