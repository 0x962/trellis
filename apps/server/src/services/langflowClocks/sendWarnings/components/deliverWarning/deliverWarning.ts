import type { HarnessHost } from "../../../../../agents/harnessHost/harnessHost.ts";
import {
	confirmWarning,
	lockExecution,
	readProjectionFacts,
	reserveWarning,
} from "../../../../../db/queries/langflowExecution";
import type { IoCtx } from "../../../../support.ts";

import { observeWarning } from "../observeWarning";

type Warning = Awaited<ReturnType<typeof reserveWarning>>;

export async function deliverWarning(
	ctx: Pick<IoCtx, "newTx" | "now" | "log">,
	warning: Warning,
	host: Pick<HarnessHost, "status" | "sendAtTurnBoundary">,
) {
	const { executionId, attemptId, messageId } = warning;
	let status = await observeWarning(ctx.log, { executionId, attemptId, messageId }, () => host.status(attemptId));
	if (status === null) return;
	if (status.id !== attemptId) throw new Error("warning_attempt_conflict");
	if (!status.acknowledgedMessageIds.includes(messageId)) {
		if (status.status !== "running" || !status.controllable || !status.acknowledgedMessageIds.includes(attemptId))
			return;
		const payload: { text: string; deadlineAt: string } = JSON.parse(warning.payloadBytes);
		if (Date.parse(payload.deadlineAt) <= ctx.now().getTime()) return;
		const allowed = await ctx.newTx(async (tx) => {
			const execution = await lockExecution(tx, { executionId });
			const facts = await readProjectionFacts(tx, { executionId });
			return execution.cancelIntent === null && !facts.stops.some((stop) => stop.attemptId === attemptId);
		});
		if (!allowed) return;
		// The runtime saves messageId before delivery. Native delivery refuses uncertain repeats.
		// Queued delivery can repeat when the write succeeds but its completion record does not persist.
		status = await observeWarning(ctx.log, { executionId, attemptId, messageId }, () =>
			host.sendAtTurnBoundary(attemptId, payload.text, messageId),
		);
		if (status === null) return;
	}
	if (status.id !== attemptId || !status.acknowledgedMessageIds.includes(messageId)) return;
	const acknowledgedAt = status.checkedAt;
	await ctx.newTx(async (tx) => {
		const saved = await reserveWarning(tx, warning);
		if (saved.acknowledged !== null) return;
		await confirmWarning(tx, {
			executionId,
			attemptId,
			messageId,
			receiptId: messageId,
			acknowledgedAt,
		});
	});
}
