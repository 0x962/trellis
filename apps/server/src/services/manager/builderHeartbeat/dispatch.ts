import { createHash } from "node:crypto";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { prepareSend } from "../../agentRuns/communication.ts";
import { sendDeadline } from "../../controller/sendDeadline.ts";
import type { ServiceCtx } from "../../support.ts";
import { collect, heartbeatContext, recordHeartbeat } from "./collect.ts";
import { builderHeartbeatMessage } from "./message.ts";

export const dispatchBuilderHeartbeats = async (
	ctx: ServiceCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
) => {
	const control = { now: ctx.now() };
	const candidates = await ctx.newTx((tx) => collect(control, tx, { sessions }));
	const results = await Promise.allSettled(
		candidates.map(async (candidate) => {
			const context = await ctx.newTx((tx) => heartbeatContext(tx, candidate));
			if (context.ticket.statusCategory !== "started") return;
			const text = builderHeartbeatMessage(candidate, context);
			const messageId = `builder-heartbeat:${candidate.terminalId}:${createHash("sha256").update(text).digest("hex")}`;
			await ctx.newTx((tx) => recordHeartbeat(control, tx, candidate.runId));
			await sendDeadline(
				send(ctx, {
					id: candidate.runId,
					text,
					messageId,
					expectedTerminalId: candidate.terminalId,
					expectedSessionId: candidate.sessionId,
					idleForMs: 120_000,
				}),
			);
		}),
	);
	const failures = results.flatMap((result, index) =>
		result.status === "rejected" ? [{ runId: candidates[index]!.runId, error: result.reason }] : [],
	);
	if (failures.length > 0)
		throw new AggregateError(
			failures.map((failure) => failure.error),
			failures
				.map(({ runId, error }) => `${runId}: ${error instanceof Error ? error.message : String(error)}`)
				.join("; "),
		);
};
