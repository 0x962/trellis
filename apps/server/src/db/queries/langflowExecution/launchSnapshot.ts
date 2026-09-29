import { and, eq } from "drizzle-orm";
import { langflowNativeHandles } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";

export async function bindLaunchSnapshot(
	tx: Tx,
	input: { executionId: string; stepId: string; attemptId: string; digest: string },
) {
	await lockExecution(tx, input);
	const [row] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, input.executionId),
				eq(langflowNativeHandles.stepId, input.stepId),
				eq(langflowNativeHandles.attemptId, input.attemptId),
			),
		);
	if (!row) throw new Error("native_snapshot_binding_conflict");
	if (row.launchSnapshotDigest !== null) {
		if (row.launchSnapshotDigest !== input.digest) throw new Error("native_snapshot_digest_conflict");
		return row;
	}
	const [saved] = await tx
		.update(langflowNativeHandles)
		.set({ launchSnapshotDigest: input.digest })
		.where(eq(langflowNativeHandles.stepId, row.stepId))
		.returning();
	return saved!;
}
