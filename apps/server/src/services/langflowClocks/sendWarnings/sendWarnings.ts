import type { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import {
	listPendingWarnings,
	lockExecution,
	readProjectionFacts,
	reserveWarning,
} from "../../../db/queries/langflowExecution";
import type { IoCtx } from "../../support.ts";
import { deliverWarning } from "../deliverWarning";
import { timeWarning } from "../timeWarning";

export async function sendWarnings(
	ctx: Pick<IoCtx, "newTx" | "home" | "now">,
	input: { executionId: string },
	host: Pick<HarnessHost, "status" | "sendAtTurnBoundary"> = nativeHost(ctx.home),
) {
	const facts = await ctx.newTx((tx) => readProjectionFacts(tx, input));
	for (const native of facts.native) {
		const attemptId = native.handle.attemptId;
		const status = await host.status(attemptId);
		if (status.id !== attemptId || status.status !== "running" || !status.controllable) continue;
		await ctx.newTx(async (tx) => {
			const execution = await lockExecution(tx, input);
			if (execution.cancelIntent !== null) return;
			const current = await readProjectionFacts(tx, input);
			if (current.stops.some((stop) => stop.attemptId === attemptId)) return;
			const refs = native.provenance.request.groupDeadlineRefs;
			const warning = timeWarning({
				...input,
				attemptId,
				deadlines: current.deadlines.filter((deadline) => refs.includes(deadline.deadlineId)),
				now: ctx.now(),
				acknowledgedMessageIds: status.acknowledgedMessageIds.filter((id) => id === attemptId),
			});
			if (warning === null) return;
			await reserveWarning(tx, {
				...input,
				messageId: warning.messageId,
				attemptId,
				deadlineId: warning.deadlineId,
				threshold: warning.threshold,
				payloadBytes: JSON.stringify({ text: warning.text, deadlineAt: warning.deadlineAt }),
			});
		});
	}
	let afterId = "";
	while (true) {
		const pending = await ctx.newTx((tx) => listPendingWarnings(tx, { ...input, afterId, limit: 100 }));
		if (pending.length === 0) return;
		for (const warning of pending) await deliverWarning(ctx, warning, host);
		afterId = pending[pending.length - 1]!.messageId;
	}
}
