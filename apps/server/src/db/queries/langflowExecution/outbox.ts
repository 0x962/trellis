import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { langflowOutbox } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
export async function listPendingDeliveries(tx: Tx, input: { executionId: string; afterId: string; limit: number }) {
	const row = await lockExecution(tx, input);
	const records = await tx
		.select()
		.from(langflowOutbox)
		.where(
			and(
				eq(langflowOutbox.executionId, input.executionId),
				gt(langflowOutbox.id, input.afterId),
				isNull(langflowOutbox.receipt),
			),
		)
		.orderBy(asc(langflowOutbox.id))
		.limit(input.limit);
	return records.map((record) => ({ ...record, authority: row.authority, canceled: row.cancelIntent !== null }));
}
