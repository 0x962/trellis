import { expect, test } from "bun:test";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../langflowContracts";
import fixture from "../../../langflowContracts/fixtures/authority.json";
import { createEngineClient } from "../../engineClient";
import { deliverAuthority } from "./deliverAuthority";

const prior = DeliveryAuthorityV1Schema.parse(fixture);
const plan = {
	initial: false,
	dataHomeId: "home",
	priorAuthorityBytes: JSON.stringify(prior),
	targetOwnerId: prior.ownerId,
	revokedAt: prior.issuedAt,
	intent: { executionId: prior.executionId, requestId: crypto.randomUUID(), expectedRevision: prior.ownershipRevision, expiresAt: prior.expiresAt },
};
const authorityBytes = JSON.stringify({ ...prior, ownershipRevision: prior.ownershipRevision + 1, capabilityId: crypto.randomUUID() });
function response(bytes: string) {
	return Response.json({ authorityBytes: bytes, authorityDigest: protocolDigest(bytes), authority: JSON.parse(bytes), revokedAt: null });
}

test("an unknown commit remains pending and a later lookup confirms the exact grant", async () => {
	const methods: string[] = [];
	let saved = plan.priorAuthorityBytes;
	const client = createEngineClient({ endpoint: "http://127.0.0.1:7860", authenticationFile: "fixture", dependencies: {
		readAuthenticationFile: async () => "fixture-token",
		fetch: async (_url, init) => {
			methods.push(init!.method!);
			if (init!.method === "POST") { saved = authorityBytes; throw new Error("lost_response"); }
			return response(saved);
		},
	} });
	const input = { client, plan, authorityBytes, signal: new AbortController().signal };
	expect(await deliverAuthority(input)).toEqual({ state: "unknown" });
	expect((await deliverAuthority(input)).state).toBe("confirmed");
	expect(methods).toEqual(["GET", "POST", "GET"]);
});

test("an unrelated engine grant cannot acknowledge a delivery", async () => {
	const client = createEngineClient({ endpoint: "http://127.0.0.1:7860", authenticationFile: "fixture", dependencies: {
		readAuthenticationFile: async () => "fixture-token",
		fetch: async () => response(JSON.stringify({ ...prior, capabilityId: crypto.randomUUID() })),
	} });
	await expect(deliverAuthority({ client, plan, authorityBytes, signal: new AbortController().signal })).rejects.toThrow("engine_authority_predecessor_conflict");
});
