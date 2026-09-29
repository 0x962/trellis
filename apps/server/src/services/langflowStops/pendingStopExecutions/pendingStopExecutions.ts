import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { langflowExecutions, langflowOutbox, langflowStops } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { terminalCancellationStatuses } from "../cancellationEngine";

export async function pendingStopExecutions(ctx: ServiceCtx, tx: Tx, input: { executionId?: string; hostId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	return tx
		.selectDistinct({ executionId: langflowExecutions.executionId })
		.from(langflowExecutions)
		.leftJoin(langflowStops, eq(langflowStops.executionId, langflowExecutions.executionId))
		.leftJoin(
			langflowOutbox,
			and(eq(langflowOutbox.executionId, langflowExecutions.executionId), eq(langflowOutbox.kind, "cancel")),
		)
		.where(
			and(
				eq(langflowExecutions.hostId, input.hostId),
				input.executionId === undefined ? undefined : eq(langflowExecutions.executionId, input.executionId),
				or(
					ne(sql<string>`${langflowStops.obligation}->>'state'`, "confirmed"),
					and(
						sql`${langflowOutbox.id} IS NOT NULL`,
						or(
							isNull(langflowOutbox.receipt),
							sql`${langflowOutbox.receipt}->>'engineStatus' NOT IN (${sql.join(
								terminalCancellationStatuses.map((status) => sql`${status}`),
								sql`, `,
							)})`,
						),
					),
				),
			),
		)
		.orderBy(langflowExecutions.executionId);
}
