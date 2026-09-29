import type { ServiceCtx } from "../../../context";
import { type WorkspaceObservationIdentity, writeWorkspaceObservation } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function recordWorkspace(
	ctx: ServiceCtx,
	tx: Tx,
	input: WorkspaceObservationIdentity & { workspaceCommit: string | null },
): Promise<void> {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	await writeWorkspaceObservation(tx, { ...input, observedAt: ctx.now });
}
