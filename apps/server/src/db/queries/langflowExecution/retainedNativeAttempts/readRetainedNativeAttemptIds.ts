import { langflowNativeHandles } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";

export async function readRetainedNativeAttemptIds(tx: Tx) {
	const rows = await tx.select({ attemptId: langflowNativeHandles.attemptId }).from(langflowNativeHandles);
	return new Set(rows.map((row) => row.attemptId));
}
