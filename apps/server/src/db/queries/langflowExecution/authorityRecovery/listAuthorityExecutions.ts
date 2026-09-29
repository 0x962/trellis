import { and, asc, eq, exists, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
	langflowExecutions as executions,
	langflowOutbox as outbox,
	langflowExecutionProjections as projections,
} from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";

export type ListAuthorityExecutionsInput = {
	hostId: string;
	afterExecutionId: string | null;
	limit: number;
};
export type AuthorityExecutionPage = {
	items: { executionId: string }[];
	nextAfterExecutionId: string | null;
};
export async function listAuthorityExecutions(
	tx: Tx,
	input: ListAuthorityExecutionsInput,
): Promise<AuthorityExecutionPage> {
	const pendingCancel = tx
		.select({ id: outbox.id })
		.from(outbox)
		.where(
			and(
				eq(outbox.executionId, executions.executionId),
				eq(outbox.kind, "cancel"),
				or(isNull(outbox.receipt), sql`${outbox.receipt}->>'state' IN ('pending', 'unknown')`),
			),
		);
	const items = await tx
		.select({ executionId: executions.executionId })
		.from(executions)
		.leftJoin(projections, eq(projections.executionId, executions.executionId))
		.where(
			and(
				eq(executions.hostId, input.hostId),
				isNotNull(executions.authority),
				isNotNull(executions.correlation),
				isNotNull(executions.engineJobId),
				input.afterExecutionId === null ? undefined : gt(executions.executionId, input.afterExecutionId),
				or(
					and(
						isNull(executions.cancelIntent),
						or(isNull(projections.executionId), sql`${projections.view}->>'status' IN ('running', 'waiting')`),
					),
					and(isNotNull(executions.cancelIntent), exists(pendingCancel)),
				),
			),
		)
		.orderBy(asc(executions.executionId))
		.limit(input.limit);
	return {
		items,
		nextAfterExecutionId: items.length === input.limit ? (items.at(-1)?.executionId ?? null) : null,
	};
}
