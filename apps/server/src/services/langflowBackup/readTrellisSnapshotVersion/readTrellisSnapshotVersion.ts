import { readReconciliationMigrations } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import type { ServiceCtx } from "../../support";

export async function readTrellisSnapshotVersion(ctx: ServiceCtx, tx: Tx) {
	const migrations = await readReconciliationMigrations(tx);
	return { trellisRelease: ctx.version, trellisDatabaseVersion: migrations.sourceDigest };
}
