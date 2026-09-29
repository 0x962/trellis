import type { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import {
	confirmWarning,
	lockExecution,
	readProjectionFacts,
	reserveWarning,
} from "../../../db/queries/langflowExecution";
import type { IoCtx } from "../../support.ts";

type Warning = Awaited<ReturnType<typeof reserveWarning>>;

export async function deliverWarning(
	ctx: Pick<IoCtx, "newTx" | "now">,
	warning: Warning,
	host: Pick<HarnessHost, "status" | "sendAtTurnBoundary">,
) {
	const { executionId, attemptId, messageId } = warning;
	let status = await host.status(attemptId);
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
		// The runtime preserves messageId before it writes the warning to the native attempt.
		// An uncertain write cannot send the same warning twice after a host restart.
		status = await host.sendAtTurnBoundary(attemptId, payload.text, messageId);
	}
	if (status.id !== attemptId || !status.acknowledgedMessageIds.includes(messageId)) return;
	await ctx.newTx(async (tx) => {
		const saved = await reserveWarning(tx, warning);
		if (saved.acknowledged !== null) return;
		await confirmWarning(tx, {
			executionId,
			attemptId,
			messageId,
			receiptId: messageId,
			acknowledgedAt: status.checkedAt,
		});
	});
}
