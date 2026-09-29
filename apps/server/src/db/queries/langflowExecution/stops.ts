import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import {
	type CancelIntentV1,
	type GroupDeadlineV1,
	protocolDigest,
	type StopObligationV1,
} from "../../../langflowContracts";
import {
	langflowDeadlines,
	langflowExecutions,
	langflowNativeHandles,
	langflowOutbox,
	langflowStops,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";

export async function recordStop(tx: Tx, input: { obligation: StopObligationV1 }) {
	const { obligation } = input;
	await lockExecution(tx, obligation);
	const [native] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, obligation.executionId),
				eq(langflowNativeHandles.stepId, obligation.stepId),
			),
		);
	if (!native || native.attemptId !== obligation.attemptId || native.agentRunId !== obligation.agentRunId)
		throw new Error("stop_attempt_conflict");
	const [existing] = await tx
		.select()
		.from(langflowStops)
		.where(
			and(eq(langflowStops.executionId, obligation.executionId), eq(langflowStops.attemptId, obligation.attemptId)),
		);
	if (existing) return existing.obligation;
	if (obligation.state !== "pending") throw new Error("stop_state_conflict");
	await tx.insert(langflowStops).values({
		obligationId: obligation.obligationId,
		executionId: obligation.executionId,
		attemptId: obligation.attemptId,
		obligation,
	});
	return obligation;
}
export async function cancelExecution(tx: Tx, input: { intent: CancelIntentV1; obligations: StopObligationV1[] }) {
	const row = await lockExecution(tx, input.intent);
	if (row.cancelIntent) {
		if (!isDeepStrictEqual(row.cancelIntent, input.intent)) throw new Error("identity_conflict");
		return row.cancelIntent;
	}
	if (row.revision !== input.intent.expectedRevision) throw new Error("execution_revision_conflict");
	for (const obligation of input.obligations) {
		if (obligation.executionId !== row.executionId) throw new Error("stop_execution_conflict");
		await recordStop(tx, { obligation });
	}
	const native = await tx
		.select()
		.from(langflowNativeHandles)
		.where(eq(langflowNativeHandles.executionId, row.executionId));
	const stops = await tx.select().from(langflowStops).where(eq(langflowStops.executionId, row.executionId));
	if (native.some((handle) => !stops.some((stop) => stop.attemptId === handle.attemptId)))
		throw new Error("missing_stop_obligation");
	await tx
		.update(langflowExecutions)
		.set({ cancelIntent: input.intent, revision: row.revision + 1 })
		.where(eq(langflowExecutions.executionId, row.executionId));
	await tx.insert(langflowOutbox).values({
		id: input.intent.requestId,
		executionId: row.executionId,
		kind: "cancel",
		payloadBytes: JSON.stringify(input.intent),
	});
	return input.intent;
}
export async function updateStop(tx: Tx, input: { expectedRevision: number; obligation: StopObligationV1 }) {
	const { obligation } = input;
	await lockExecution(tx, obligation);
	const [row] = await tx.select().from(langflowStops).where(eq(langflowStops.obligationId, obligation.obligationId));
	if (!row) throw new Error("stop_not_found");
	const saved = row.obligation;
	if (isDeepStrictEqual(saved, obligation)) return saved;
	if (
		saved.state === "confirmed" ||
		saved.revision !== input.expectedRevision ||
		obligation.revision !== input.expectedRevision + 1 ||
		saved.executionId !== obligation.executionId ||
		saved.attemptId !== obligation.attemptId ||
		saved.stepId !== obligation.stepId ||
		saved.agentRunId !== obligation.agentRunId ||
		saved.requestedAt !== obligation.requestedAt ||
		saved.reason !== obligation.reason ||
		(obligation.state === "confirmed" && obligation.exitReceipt.attemptId !== saved.attemptId)
	)
		throw new Error("stop_conflict");
	await tx.update(langflowStops).set({ obligation }).where(eq(langflowStops.obligationId, obligation.obligationId));
	return obligation;
}
export async function recordDeadline(tx: Tx, input: { executionId: string; deadline: GroupDeadlineV1 }) {
	await lockExecution(tx, input);
	const { deadline } = input;
	const [row] = await tx
		.select()
		.from(langflowDeadlines)
		.where(
			and(
				eq(langflowDeadlines.executionId, input.executionId),
				eq(langflowDeadlines.groupDigest, protocolDigest(deadline.groupOccurrenceKey)),
			),
		);
	if (row) {
		if (
			row.groupOccurrenceKey !== deadline.groupOccurrenceKey ||
			row.deadline.budgetMs !== deadline.budgetMs ||
			row.id !== deadline.deadlineId
		)
			throw new Error("deadline_conflict");
		if (row.deadline.launchedAt !== null || deadline.launchedAt === null) return row.deadline;
		await tx.update(langflowDeadlines).set({ deadline }).where(eq(langflowDeadlines.id, row.id));
	} else
		await tx.insert(langflowDeadlines).values({
			id: deadline.deadlineId,
			executionId: input.executionId,
			groupOccurrenceKey: deadline.groupOccurrenceKey,
			groupDigest: protocolDigest(deadline.groupOccurrenceKey),
			deadline,
		});
	return deadline;
}
