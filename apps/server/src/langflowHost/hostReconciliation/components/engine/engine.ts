import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../../langflowContracts";
import { createEngineClient, type EngineClientDependencies } from "../../../engineClient";
import { readReconciliationIssuer } from "../../../engineReconciliation/credential/credential";
import {
	EngineLeaseSchema,
	LiveEngineIdentitySchema,
	parseEngineLeaseRecord,
} from "../../../engineReconciliation/schema/schema";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";
import type { HostReconciliationInput } from "../../contracts";
import { readCurrentIdentity } from "../identity";

const AuthoritySchema = z.strictObject({
	authorityBytes: z.string(),
	authorityDigest: z.string(),
	authority: DeliveryAuthorityV1Schema,
	revokedAt: z.string().nullable(),
});

export async function readHeldEngine(
	home: string,
	input: HostReconciliationInput,
	signal: AbortSignal,
	dependencies?: Partial<EngineClientDependencies>,
) {
	const current = await readCurrentIdentity(home, input);
	const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(home), "engine-reconciliation"));
	const block = input.block;
	const key = JSON.stringify([block.dataHomeId, block.id, block.generation, block.requestId]);
	const leaseBytes = objects.read(objects.readBinding(key));
	const lease = EngineLeaseSchema.parse(JSON.parse(leaseBytes));
	const issuer = readReconciliationIssuer(current.identity);
	if (
		!isDeepStrictEqual(lease.identity, input.observation.identity) ||
		!isDeepStrictEqual(lease.block, {
			id: block.id, dataHomeId: block.dataHomeId, generation: block.generation, requestId: block.requestId,
		}) ||
		lease.issuerDigest !== protocolDigest(issuer)
	) throw new Error("host_reconciliation_lease_conflict");
	const client = createEngineClient({
		endpoint: input.observation.endpoint,
		authenticationFile: join(current.identity.home, "langflow", "secrets", `${lease.identity.instanceId}.token`),
		dependencies: {
			...dependencies,
			fetch: (url, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Trellis-Reconciliation-Issuer", issuer);
				return (dependencies?.fetch ?? fetch)(url, { ...init, headers });
			},
		},
	});
	async function read(path: `/trellis-v1${string}`) {
		const response = await client.request({
			method: "GET",
			path,
			signal: AbortSignal.any([signal, AbortSignal.timeout(input.manifest.health.requestTimeoutMs)]),
		});
		if (response.state !== "received" || response.status !== 200)
			throw new Error("host_reconciliation_engine_unknown");
		return new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
	}
	const sourceBytes = await read(`/trellis-v1/reconciliation-leases/${lease.id}`);
	const record = parseEngineLeaseRecord(sourceBytes, leaseBytes);
	if (record.state !== "active") throw new Error("host_reconciliation_engine_not_excluded");
	const liveBytes = await read(`/trellis-v1/reconciliation-leases/${lease.id}/identity`);
	const live = LiveEngineIdentitySchema.parse(JSON.parse(liveBytes));
	if (
		!isDeepStrictEqual(live, record.identity) ||
		live.package.enginePackageDigest !== input.enginePackageDigest ||
		live.package.componentManifestHash !== input.manifest.components.catalog.sha256 ||
		live.package.engineCommit !== input.manifest.source.commit ||
		live.package.engineConfigSha256 !== input.engineConfigSha256 ||
		live.database.path !== "/data/config/langflow.db" ||
		live.database.alembicHeads.length === 0
	) throw new Error("host_reconciliation_engine_facts_conflict");
	await readCurrentIdentity(home, input);
	return {
		record,
		sourceBytes,
		sourceDigest: protocolDigest(sourceBytes),
		async readEmpty() {
			const bytes = await read(`/trellis-v1/reconciliation-leases/${lease.id}/empty`);
			const result = z.strictObject({ empty: z.boolean() }).parse(JSON.parse(bytes));
			return { ...result, sourceBytes: bytes, sourceDigest: protocolDigest(bytes) };
		},
		async readAuthority(executionId: string) {
			const bytes = await read(
				`/trellis-v1/reconciliation-leases/${lease.id}/authorities/${encodeURIComponent(executionId)}`,
			);
			const saved = AuthoritySchema.parse(JSON.parse(bytes));
			const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(saved.authorityBytes));
			const reported = { ...saved.authority, issuedAt: authority.issuedAt, expiresAt: authority.expiresAt };
			if (
				authority.executionId !== executionId || protocolDigest(saved.authorityBytes) !== saved.authorityDigest ||
				Date.parse(saved.authority.issuedAt) !== Date.parse(authority.issuedAt) ||
				Date.parse(saved.authority.expiresAt) !== Date.parse(authority.expiresAt) ||
				!isDeepStrictEqual(reported, authority)
			)
				throw new Error("host_reconciliation_authority_digest_conflict");
			return { ...saved, authority, sourceBytes: bytes, sourceDigest: protocolDigest(bytes) };
		},
	};
}
