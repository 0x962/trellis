import { eq } from "drizzle-orm";
import {
	langflowCompletions,
	langflowDeadlines,
	langflowDecisions,
	langflowNativeHandles,
	langflowStops,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
export async function readProjectionFacts(tx: Tx, input: { executionId: string }) {
	const native = await tx
		.select()
		.from(langflowNativeHandles)
		.where(eq(langflowNativeHandles.executionId, input.executionId));
	const completions = await tx
		.select()
		.from(langflowCompletions)
		.where(eq(langflowCompletions.executionId, input.executionId));
	const decisions = await tx
		.select()
		.from(langflowDecisions)
		.where(eq(langflowDecisions.executionId, input.executionId));
	const stops = await tx.select().from(langflowStops).where(eq(langflowStops.executionId, input.executionId));
	const deadlines = await tx
		.select()
		.from(langflowDeadlines)
		.where(eq(langflowDeadlines.executionId, input.executionId));
	return {
		native: native.map((row) => {
			const completed = completions.find((value) => value.stepId === row.stepId);
			return {
				provenance: row.provenance,
				handle: row.handle,
				launchReceipt: row.launchReceipt,
				completion: completed
					? { completion: completed.completion, resultDigest: completed.resultDigest, receipt: completed.acceptance }
					: null,
			};
		}),
		humanDeliveries: decisions.map((row) => row.delivery),
		stops: stops.map((row) => row.obligation),
		deadlines: deadlines.map((row) => row.deadline),
	};
}
