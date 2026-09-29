import { asc, eq } from "drizzle-orm";
import {
	langflowExecutions,
	langflowExecutionProjections,
	langflowOutbox,
} from "../../../../../../db/tables/langflowExecution";
import type { Tx } from "../../../../../../db/tx";

export async function readActiveOwnership(tx: Tx) {
	const executions = await tx.select({ execution: langflowExecutions, projection: langflowExecutionProjections })
		.from(langflowExecutions)
		.leftJoin(langflowExecutionProjections, eq(langflowExecutionProjections.executionId, langflowExecutions.executionId))
		.orderBy(asc(langflowExecutions.executionId));
	const cancellations = await tx.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "cancel"));
	return executions.filter(({ execution, projection }) => {
		if (!execution.cancelIntent) return projection === null || ["running", "waiting"].includes(projection.view.status);
		return cancellations.some((entry) => entry.executionId === execution.executionId &&
			(entry.receipt === null || ["pending", "unknown"].includes(String(entry.receipt.state))));
	}).map(({ execution }) => execution);
}
