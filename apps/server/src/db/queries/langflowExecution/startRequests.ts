import { and, desc, eq } from "drizzle-orm";
import {
	langflowStartReceipts as requests,
	langflowExecutions,
	langflowExecutionProjections,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
export type StartRequestIdentity = { actorKind: string; actorName: string; requestId: string };
export async function readStartRequest(tx: Tx, input: StartRequestIdentity) {
	const [row] = await tx
		.select()
		.from(requests)
		.where(
			and(
				eq(requests.actorKind, input.actorKind),
				eq(requests.actorName, input.actorName),
				eq(requests.requestId, input.requestId),
			),
		);
	return row ?? null;
}
export async function saveStartRequest(
	tx: Tx,
	input: StartRequestIdentity & { requestBytes: string; executionId: string },
) {
	const [row] = await tx.insert(requests).values(input).onConflictDoNothing().returning();
	if (row) return row;
	const saved = (await readStartRequest(tx, input))!;
	if (saved.requestBytes !== input.requestBytes || saved.executionId !== input.executionId)
		throw new Error("identity_conflict");
	return saved;
}
export async function latestExecution(tx: Tx, input: { flowId: string; diffId: string }) {
	const [row] = await tx
		.select({ execution: langflowExecutions, view: langflowExecutionProjections.view })
		.from(langflowExecutions)
		.leftJoin(
			langflowExecutionProjections,
			eq(langflowExecutionProjections.executionId, langflowExecutions.executionId),
		)
		.where(and(eq(langflowExecutions.flowId, input.flowId), eq(langflowExecutions.diffId, input.diffId)))
		.orderBy(desc(langflowExecutions.createdAt), desc(langflowExecutions.executionId))
		.limit(1);
	return row ?? null;
}
