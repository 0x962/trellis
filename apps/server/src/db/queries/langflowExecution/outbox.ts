import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { langflowOutbox } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
export async function listPendingDeliveries(
	tx: Tx,
	input: { executionId: string; afterId: string; afterKind: string; limit: number },
) {
	const row = await lockExecution(tx, input);
	const records = await tx
		.select()
		.from(langflowOutbox)
		.where(
			and(
				eq(langflowOutbox.executionId, input.executionId),
				or(
					gt(langflowOutbox.id, input.afterId),
					and(eq(langflowOutbox.id, input.afterId), sql`${langflowOutbox.kind} > ${input.afterKind}`),
				),
				isNull(langflowOutbox.receipt),
				row.cancelIntent ? eq(langflowOutbox.kind, "cancel") : undefined,
			),
		)
		.orderBy(asc(langflowOutbox.id), asc(langflowOutbox.kind))
		.limit(input.limit);
	return records.map((record) => ({ ...record, authority: row.authority, canceled: row.cancelIntent !== null }));
}
