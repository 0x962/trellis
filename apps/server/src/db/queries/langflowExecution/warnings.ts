import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { langflowDeadlines, langflowNativeHandles, langflowWarnings as warnings } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";
export async function reserveWarning(tx: Tx, input: Omit<typeof warnings.$inferInsert, "acknowledged">) {
	const execution = await lockExecution(tx, input);
	const [existing] = await tx
		.select()
		.from(warnings)
		.where(
			and(
				eq(warnings.executionId, input.executionId),
				eq(warnings.attemptId, input.attemptId),
				eq(warnings.deadlineId, input.deadlineId),
				eq(warnings.threshold, input.threshold),
			),
		);
	if (existing) {
		if (existing.payloadBytes !== input.payloadBytes) throw new Error("warning_conflict");
		return existing;
	}
	if (execution.cancelIntent) throw new Error("execution_canceled");
	const [native] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, input.executionId),
				eq(langflowNativeHandles.attemptId, input.attemptId),
			),
		);
	const [deadline] = await tx
		.select()
		.from(langflowDeadlines)
		.where(and(eq(langflowDeadlines.executionId, input.executionId), eq(langflowDeadlines.id, input.deadlineId)));
	if (
		!native ||
		!deadline ||
		deadline.deadline.launchedAt === null ||
		!native.provenance.request.groupDeadlineRefs.includes(input.deadlineId)
	)
		throw new Error("warning_identity_conflict");
	const [row] = await tx.insert(warnings).values(input).returning();
	return row!;
}
export async function confirmWarning(
	tx: Tx,
	input: { executionId: string; messageId: string; attemptId: string; receiptId: string; acknowledgedAt: string },
) {
	await lockExecution(tx, input);
	const [row] = await tx
		.select()
		.from(warnings)
		.where(
			and(
				eq(warnings.executionId, input.executionId),
				eq(warnings.messageId, input.messageId),
				eq(warnings.attemptId, input.attemptId),
			),
		);
	if (!row) throw new Error("warning_identity_conflict");
	const acknowledged = { receiptId: input.receiptId, acknowledgedAt: input.acknowledgedAt };
	if (row.acknowledged && !isDeepStrictEqual(row.acknowledged, acknowledged)) throw new Error("identity_conflict");
	await tx.update(warnings).set({ acknowledged }).where(eq(warnings.messageId, input.messageId));
	return { ...row, acknowledged };
}
export async function listPendingWarnings(tx: Tx, input: { executionId: string; afterId: string; limit: number }) {
	const execution = await lockExecution(tx, input);
	if (execution.cancelIntent) return [];
	return tx
		.select()
		.from(warnings)
		.where(
			and(
				eq(warnings.executionId, input.executionId),
				gt(warnings.messageId, input.afterId),
				isNull(warnings.acknowledged),
			),
		)
		.orderBy(asc(warnings.messageId))
		.limit(input.limit);
}
