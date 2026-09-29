import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import type {
	AuthorityCommit,
	OwnerRevocation,
	OwnershipSnapshot,
	SidecarIdentity,
} from "../../../../langflowHost/contracts";
import { langflowOwnershipReceipts } from "../../../tables/langflowExecution";
import { langflowAuthorityCommits, langflowOwnerFences } from "../../../tables/langflowExecution/authorityControl";
import type { Tx } from "../../../tx";
import { lockExecution } from "../executions";
import { assertOwnerActive, lockOwner, lockOwners } from "../ownerFence";
import { transferOwnership } from "../ownership";

async function revokeOwner(
	tx: Tx,
	input: { identity: SidecarIdentity; observationId: string },
): Promise<OwnerRevocation> {
	const row = await lockOwner(tx, input.identity);
	if (row.revocation) {
		if (!isDeepStrictEqual(row.revocation.identity, input.identity)) throw new Error("owner_identity_conflict");
		return row.revocation;
	}
	const revocation = { id: randomUUID(), ...input };
	await tx.update(langflowOwnerFences).set({ revocation }).where(eq(langflowOwnerFences.id, row.id));
	return revocation;
}

async function readRevocation(tx: Tx, input: { dataHomeId: string; hostId: string; ownerId: string }) {
	const row = await lockOwner(tx, input);
	if (row.revocation && row.revocation.identity.dataHomeId !== input.dataHomeId)
		throw new Error("owner_identity_conflict");
	return row.revocation;
}

async function storedCommit(
	tx: Tx,
	input: { executionId: string; requestId: string },
): Promise<AuthorityCommit | null> {
	const [row] = await tx
		.select({ commit: langflowAuthorityCommits.commit })
		.from(langflowOwnershipReceipts)
		.leftJoin(langflowAuthorityCommits, eq(langflowAuthorityCommits.receiptId, langflowOwnershipReceipts.id))
		.where(
			and(
				eq(langflowOwnershipReceipts.executionId, input.executionId),
				eq(langflowOwnershipReceipts.requestId, input.requestId),
			),
		);
	if (!row) return null;
	if (!row.commit) throw new Error("authority_bytes_unavailable");
	return row.commit;
}

async function readReceipt(tx: Tx, input: { executionId: string; requestId: string }) {
	await lockExecution(tx, input);
	const saved = await storedCommit(tx, input);
	if (saved) await transferOwnership(tx, saved);
	return saved;
}

async function read(tx: Tx, input: { executionId: string }): Promise<OwnershipSnapshot> {
	const row = await lockExecution(tx, input);
	if (!row.authority) throw new Error("authority_unavailable");
	return { canceled: row.cancelIntent !== null, authority: row.authority, admission: row.admission };
}

async function commit(tx: Tx, input: AuthorityCommit): Promise<AuthorityCommit> {
	const { receipt, observation, revocation } = input;
	await lockExecution(tx, receipt.request);
	const authority = receipt.authority;
	if (
		!isDeepStrictEqual(JSON.parse(input.authorityBytes), authority) ||
		!isDeepStrictEqual(JSON.parse(input.requestBytes), receipt.request) ||
		observation.id !== receipt.request.supervisorObservationId ||
		observation.identity.hostId !== authority.hostId ||
		observation.identity.ownerId !== authority.ownerId ||
		observation.observedAt !== authority.issuedAt
	)
		throw new Error("authority_commit_conflict");
	await lockOwners(tx, [authority, ...(revocation ? [revocation.identity] : [])]);
	await assertOwnerActive(tx, authority);
	if ("transferId" in receipt) {
		if (
			!revocation ||
			revocation.id !== receipt.request.priorOwnerRevocationId ||
			revocation.identity.ownerId !== receipt.request.expectedOwnerId ||
			revocation.identity.hostId !== authority.hostId ||
			revocation.identity.dataHomeId !== observation.identity.dataHomeId ||
			!isDeepStrictEqual(await readRevocation(tx, revocation.identity), revocation)
		)
			throw new Error("owner_revocation_conflict");
	} else if (revocation !== null) throw new Error("owner_revocation_conflict");
	const saved = await storedCommit(tx, receipt.request);
	if (saved && !isDeepStrictEqual(saved, input)) throw new Error("identity_conflict");
	await transferOwnership(tx, input);
	if (saved) return saved;
	await tx.insert(langflowAuthorityCommits).values({
		receiptId: "transferId" in receipt ? receipt.transferId : receipt.renewalId,
		commit: input,
	});
	return input;
}

export const authorityControl = { revokeOwner, readRevocation, readReceipt, read, commit };
