import { eq } from "drizzle-orm";
import { langflowNativeHandles } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";

export async function isAttemptRetained(tx: Tx, input: { attemptId: string }) {
	const [row] = await tx
		.select({ attemptId: langflowNativeHandles.attemptId })
		.from(langflowNativeHandles)
		.where(eq(langflowNativeHandles.attemptId, input.attemptId));
	return row !== undefined;
}
