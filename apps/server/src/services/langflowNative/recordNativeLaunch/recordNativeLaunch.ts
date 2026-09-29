import type { ServiceCtx } from "../../../context";
import { lockExecution, readProjectionFacts, recordLaunch } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { recordLaunchClocks, startDeadline } from "../../langflowClocks";
import { readReservation } from "../readReservation";

export async function recordNativeLaunch(
	ctx: ServiceCtx,
	tx: Tx,
	input: { executionId: string; stepId: string; attemptId: string; launchedAt: string },
) {
	await lockExecution(tx, input);
	const reservation = await readReservation(tx, input);
	if (reservation.attemptId !== input.attemptId) throw new Error("native_attempt_conflict");
	if (reservation.launchReceipt !== null) {
		if (reservation.launchReceipt.launchedAt !== input.launchedAt) throw new Error("native_launch_time_conflict");
		return;
	}
	const facts = await readProjectionFacts(tx, input);
	const receipt = {
		version: 1 as const,
		launchReceiptId: `launch:${input.attemptId}`,
		stepId: input.stepId,
		attemptId: input.attemptId,
		launchedAt: input.launchedAt,
		recordedAt: ctx.now.toISOString(),
		groupDeadlines: [],
	};
	const groupDeadlines = reservation.provenance.request.groupDeadlineRefs.map((ref) => {
		const deadline = facts.deadlines.find((value) => value.deadlineId === ref);
		if (!deadline) throw new Error("native_deadline_missing");
		return startDeadline(deadline, receipt);
	});
	await recordLaunch(tx, { executionId: input.executionId, receipt: { ...receipt, groupDeadlines } });
	await recordLaunchClocks(ctx, tx, input);
}
