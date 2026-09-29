import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { langflowOwnerFences } from "../../../tables/langflowExecution/authorityControl";
import type { Tx } from "../../../tx";

type Owner = { hostId: string; ownerId: string };
export async function lockOwner(tx: Tx, input: Owner) {
	const ownerKey = [input.hostId, input.ownerId];
	await tx.insert(langflowOwnerFences).values({ id: randomUUID(), ownerKey }).onConflictDoNothing();
	const [row] = await tx
		.select()
		.from(langflowOwnerFences)
		.where(eq(langflowOwnerFences.ownerKey, ownerKey))
		.for("update");
	return row!;
}
export async function lockOwners(tx: Tx, input: Owner[]) {
	const owners = new Map(input.map((owner) => [JSON.stringify([owner.hostId, owner.ownerId]), owner]));
	for (const key of [...owners.keys()].sort()) await lockOwner(tx, owners.get(key)!);
}
export async function assertOwnerActive(tx: Tx, input: Owner) {
	const row = await lockOwner(tx, input);
	if (row.revocation) throw new Error("owner_revoked");
}
