import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.strictObject({
	dataHomeId: z.uuid(),
	hostId: z.uuid(),
	ownerId: z.uuid(),
	instanceId: z.uuid(),
	manifestDigest: digest,
});
export const EngineLeaseSchema = z.strictObject({
	version: z.literal(1),
	id: z.uuid(),
	block: z.strictObject({
		id: z.uuid(),
		dataHomeId: z.uuid(),
		generation: z.number().int().positive().safe(),
		requestId: z.string().min(1),
	}),
	identity,
	issuerDigest: digest,
});
export const LiveEngineIdentitySchema = z.strictObject({
	runtime: identity,
	package: z.strictObject({
		enginePackageDigest: digest,
		componentManifestHash: digest,
		engineCommit: z.string().regex(/^[a-f0-9]{40}$/),
		engineConfigSha256: digest,
	}),
	database: z.strictObject({
		path: z.string().min(1),
		contentSha256: digest,
		size: z.number().int().nonnegative().safe(),
		alembicHeads: z.array(z.string().min(1)),
	}),
	secret: z.strictObject({ sha256: digest }),
});
export const EngineLeaseRecordSchema = z.strictObject({
	leaseBytes: z.string().min(1),
	leaseDigest: digest,
	state: z.enum(["active", "released"]),
	identity: LiveEngineIdentitySchema,
	identityBytes: z.string().min(1),
	identityDigest: digest,
	acknowledgementBytes: z.string().nullable(),
	receiptId: digest,
});
export type EngineLease = z.infer<typeof EngineLeaseSchema>;
export type EngineLeaseRecord = z.infer<typeof EngineLeaseRecordSchema>;
export type LiveEngineIdentity = z.infer<typeof LiveEngineIdentitySchema>;

export function parseEngineLeaseRecord(sourceBytes: string, leaseBytes: string) {
	const record = EngineLeaseRecordSchema.parse(JSON.parse(sourceBytes));
	const lease = EngineLeaseSchema.parse(JSON.parse(leaseBytes));
	const receiptBytes = JSON.stringify({
		leaseBytes: record.leaseBytes,
		state: record.state,
		identityBytes: record.identityBytes,
		acknowledgementBytes: record.acknowledgementBytes,
	});
	if (
		record.leaseBytes !== leaseBytes || record.leaseDigest !== protocolDigest(leaseBytes) ||
		record.identityDigest !== protocolDigest(record.identityBytes) ||
		record.receiptId !== protocolDigest(receiptBytes) ||
		!isDeepStrictEqual(record.identity, LiveEngineIdentitySchema.parse(JSON.parse(record.identityBytes))) ||
		!isDeepStrictEqual(record.identity.runtime, lease.identity) ||
		lease.block.dataHomeId !== lease.identity.dataHomeId ||
		(record.state === "active" && record.acknowledgementBytes !== null)
	) throw new Error("engine_reconciliation_receipt_conflict");
	return record;
}
