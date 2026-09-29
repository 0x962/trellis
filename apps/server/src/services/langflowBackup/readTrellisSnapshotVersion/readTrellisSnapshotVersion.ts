import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import type { ServiceCtx } from "../../support";

export async function readTrellisSnapshotVersion(ctx: ServiceCtx, tx: Tx) {
	const migrations = await rows<{ id: number; hash: string; created_at: string }>(
		tx,
		sql`SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`,
	);
	if (migrations.length === 0) throw new Error("paired_trellis_migrations_missing");
	return { trellisRelease: ctx.version, trellisDatabaseVersion: protocolDigest(JSON.stringify(migrations)) };
}
