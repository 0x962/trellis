import { eq } from "drizzle-orm";
import { EngineCheckpointV1Schema, protocolDigest } from "../../../../langflowContracts";
import { langflowExecutionProjections } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";
import type { lockExecution } from "../executions";

export type EngineSnapshotInput = { sourceCursor: number; snapshotBytes: string };
export type StoredEngineSnapshot = EngineSnapshotInput & { snapshotDigest: string };

export async function readEngineSnapshot(tx: Tx, input: { executionId: string }): Promise<StoredEngineSnapshot | null> {
	const [row] = await tx.select({
		sourceCursor: langflowExecutionProjections.sourceCursor,
		snapshotBytes: langflowExecutionProjections.snapshotBytes,
		snapshotDigest: langflowExecutionProjections.snapshotDigest,
	}).from(langflowExecutionProjections).where(eq(langflowExecutionProjections.executionId, input.executionId));
	return row?.snapshotBytes === null || !row ? null : {
		sourceCursor: row.sourceCursor, snapshotBytes: row.snapshotBytes, snapshotDigest: row.snapshotDigest!,
	};
}

export async function prepareEngineSnapshot(
	tx: Tx,
	execution: Awaited<ReturnType<typeof lockExecution>>,
	input: EngineSnapshotInput,
) {
	const snapshot = JSON.parse(input.snapshotBytes);
	const checkpoint = EngineCheckpointV1Schema.parse(JSON.parse(snapshot.checkpointBytes));
	if (
		!Number.isSafeInteger(input.sourceCursor) || input.sourceCursor < 0 ||
		snapshot.version !== 1 || snapshot.executionId !== execution.executionId ||
		snapshot.publicationId !== execution.publicationId || snapshot.engineJobId !== execution.engineJobId ||
		snapshot.engineEpoch !== execution.authority?.engineEpoch || snapshot.sourceCursor !== input.sourceCursor ||
		checkpoint.executionId !== execution.executionId || checkpoint.publicationId !== execution.publicationId ||
		checkpoint.engineJobId !== execution.engineJobId || checkpoint.engineEpoch !== snapshot.engineEpoch
	)
		throw new Error("engine_snapshot_identity_conflict");
	const previous = await readEngineSnapshot(tx, execution);
	if (previous && (
		input.sourceCursor < previous.sourceCursor ||
		(input.sourceCursor === previous.sourceCursor && input.snapshotBytes !== previous.snapshotBytes)
	))
		throw new Error("engine_snapshot_cursor_conflict");
	return { ...input, snapshotDigest: protocolDigest(input.snapshotBytes), checkpoint };
}
