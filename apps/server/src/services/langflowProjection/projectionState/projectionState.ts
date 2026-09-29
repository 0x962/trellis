import type { ServiceCtx } from "../../../context";
import {
	assertAuthority,
	lockExecution,
	readEngineSnapshot,
	readProjection,
} from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function projectionState(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	const stored = await readProjection(tx, input);
	if (!stored || !execution.authority || !execution.engineJobId) return null;
	await assertAuthority(tx, execution, execution.authority, "events.append", ctx.now);
	const snapshot = await readEngineSnapshot(tx, input);
	return {
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		engineJobId: execution.engineJobId,
		authority: execution.authority,
		expectedRevision: stored.view.revision,
		after: snapshot?.sourceCursor ?? 0,
	};
}

export type PreparedProjection = NonNullable<Awaited<ReturnType<typeof projectionState>>>;
