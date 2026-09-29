import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../../langflowContracts";
import type { Tx } from "../../../tx";
import { canonicalJson } from "./canonicalJson";
import type { ReconciliationSource } from "./schema";

export async function readReconciliationMigrations(tx: Tx): Promise<ReconciliationSource> {
	const result = await tx.execute<{ id: string; hash: string; created_at: string }>(sql`
		SELECT id::text AS id, hash::text AS hash, created_at::text AS created_at
		FROM drizzle.__drizzle_migrations ORDER BY id
	`);
	const sourceBytes = canonicalJson(JSON.stringify({ version: 1, rows: result.rows }));
	return { sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
}
