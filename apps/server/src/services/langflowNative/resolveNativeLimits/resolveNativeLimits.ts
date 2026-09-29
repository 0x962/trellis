import type { ServiceCtx } from "../../../context";
import { readProjectionFacts } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { readReservation } from "../readReservation";

export async function resolveNativeLimits(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { executionId: string; stepId: string; attemptId: string },
) {
	const reservation = await readReservation(tx, input);
	if (reservation.attemptId !== input.attemptId) throw new Error("native_attempt_conflict");
	const request = reservation.provenance.request;
	const facts = await readProjectionFacts(tx, input);
	let deadlineAt = request.deadlineAt === null ? Infinity : Date.parse(request.deadlineAt);
	let budgetMs = Infinity;
	for (const ref of request.groupDeadlineRefs) {
		const deadline = facts.deadlines.find((value) => value.deadlineId === ref);
		if (!deadline) throw new Error("native_deadline_missing");
		if (deadline.deadlineAt === null) budgetMs = Math.min(budgetMs, deadline.budgetMs);
		else deadlineAt = Math.min(deadlineAt, Date.parse(deadline.deadlineAt));
	}
	return {
		deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : undefined,
		budgetMs: Number.isFinite(budgetMs) ? budgetMs : undefined,
	};
}
