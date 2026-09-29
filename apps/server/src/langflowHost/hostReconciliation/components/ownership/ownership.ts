import { isDeepStrictEqual } from "node:util";
import { asc, eq } from "drizzle-orm";
import { langflowExecutions, langflowOwnerFences } from "../../../../db/tables/langflowExecution";
import type { Tx } from "../../../../db/tx";
import { protocolDigest } from "../../../../langflowContracts";
import type { DispatchReceiptArchive } from "../../../receiptArchive";
import type { HostReconciliationInput } from "../../contracts";
import { readActiveOwnership } from "./components/readActiveOwnership";
import type { readEngineOwnership } from "./components/readEngineOwnership";

export async function verifyOwnership(
	tx: Tx,
	input: HostReconciliationInput,
	before: Awaited<ReturnType<typeof readActiveOwnership>>,
	engine: Awaited<ReturnType<typeof readEngineOwnership>>,
	archive: DispatchReceiptArchive,
	now: Date,
) {
	await tx.select().from(langflowExecutions).orderBy(asc(langflowExecutions.executionId)).for("update");
	const records = await readActiveOwnership(tx);
	if (!isDeepStrictEqual(records, before)) throw new Error("host_reconciliation_ownership_changed");
	const identity = input.observation.identity;
	const fences = await tx.select().from(langflowOwnerFences)
		.where(eq(langflowOwnerFences.ownerKey, [identity.hostId, identity.ownerId])).for("update");
	const fence = fences.find((row) => isDeepStrictEqual(row.ownerKey, [identity.hostId, identity.ownerId]));
	if (fence?.revocation || (!fence && (input.block.reason.kind !== "initialize" || records.length !== 0)))
		throw new Error("host_reconciliation_owner_revoked");
	for (const row of records) {
		const authority = row.authority;
		if (
			!authority || !row.correlation || !row.engineJobId ||
			row.hostId !== identity.hostId || authority.hostId !== identity.hostId ||
			authority.ownerId !== identity.ownerId || authority.executionId !== row.executionId ||
			authority.engineJobId !== row.engineJobId || authority.publicationId !== row.publicationId ||
			Date.parse(authority.expiresAt) <= now.getTime()
		) throw new Error("host_reconciliation_authority_unavailable");
		if (row.cancelIntent && (authority.permissions.length !== 1 || authority.permissions[0] !== "execution.cancel"))
			throw new Error("host_reconciliation_cancel_authority_conflict");
		const bytes = archive.readAuthorityBytes(authority);
		const saved = engine.find((entry) => entry.authority.executionId === row.executionId);
		if (!saved || saved.revokedAt !== null || saved.authorityBytes !== bytes)
			throw new Error("host_reconciliation_engine_authority_conflict");
	}
	const sourceBytes = JSON.stringify({ observation: input.observation, fence: fence ?? null, records, engine });
	return { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
}
