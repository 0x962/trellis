import { eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { assertAuthority, lockExecution, recordDeadline } from "../../../db/queries/langflowExecution";
import { langflowDeadlines } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";
import { earliestDeadline } from "../earliestDeadline";
import { type GroupDeadlineResult, type GroupDeadlineScope, GroupDeadlineScopeSchema } from "../groupDeadlineContract";
import { groupBudget } from "./components/groupBudget";

export async function reserveGroupDeadline(
	ctx: ServiceCtx,
	tx: Tx,
	input: { request: GroupDeadlineScope; capabilityId: string },
): Promise<GroupDeadlineResult> {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const request = GroupDeadlineScopeSchema.parse(input.request);
	const execution = await lockExecution(tx, request);
	const authority = execution.authority;
	if (!authority || authority.capabilityId !== input.capabilityId) throw new Error("authority_conflict");
	await assertAuthority(tx, execution, authority, "native.reserve", ctx.now);
	if (execution.cancelIntent !== null || execution.admission.state !== "open") throw new Error("admission_closed");
	if (
		execution.publicationId !== request.publicationId ||
		execution.engineJobId !== request.engineJobId ||
		authority.engineEpoch !== request.engineEpoch ||
		execution.snapshot.documentHash !== execution.publication.documentHash ||
		execution.admission.receipt.engineEpoch !== request.engineEpoch ||
		request.occurrenceKey !== request.occurrence.occurrenceKey
	)
		throw new Error("group_execution_conflict");
	const budgetMs = groupBudget(execution.snapshot, request);
	const occurrence = request.occurrence;
	const deadlineId = protocolDigest(
		JSON.stringify([
			"group-deadline-v1",
			execution.executionId,
			execution.publicationId,
			request.scopeVertexId,
			occurrence.nodeId,
			occurrence.occurrenceKey,
			occurrence.parentOccurrenceKey,
			occurrence.phase,
			occurrence.iterationPath.map((item) => [item.loopNodeId, item.round]),
			request.scope.groupDeadlineRefs,
		]),
	);
	const records = await tx
		.select()
		.from(langflowDeadlines)
		.where(eq(langflowDeadlines.executionId, execution.executionId));
	const ancestors = request.scope.groupDeadlineRefs.map((ref) => {
		const saved = records.find((record) => record.id === ref);
		if (!saved || saved.groupOccurrenceKey === occurrence.occurrenceKey) throw new Error("group_ancestor_conflict");
		return saved.deadline;
	});
	const deadline = await recordDeadline(tx, {
		executionId: execution.executionId,
		deadline: {
			deadlineId,
			groupOccurrenceKey: occurrence.occurrenceKey,
			budgetMs,
			launchedAt: null,
			deadlineAt: null,
			launchReceiptId: null,
		},
	});
	const earliest = earliestDeadline([...ancestors, deadline])?.deadlineAt ?? null;
	const inherited = request.scope.deadlineAt;
	const deadlineAt =
		earliest === null
			? inherited
			: inherited === null || Date.parse(earliest) <= Date.parse(inherited)
				? earliest
				: inherited;
	if (!records.some((record) => record.id === deadline.deadlineId))
		ctx.emit({ type: "flows.changed", id: execution.flowId });
	return { deadline, groupDeadlineRefs: [...request.scope.groupDeadlineRefs, deadline.deadlineId], deadlineAt };
}
