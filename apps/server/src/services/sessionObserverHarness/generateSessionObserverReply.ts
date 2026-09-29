import { mkdir } from "node:fs/promises";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { getRun } from "../agentRuns/queries.ts";
import { sessionOperation } from "../sessions/operation.ts";
import type { IoCtx } from "../support.ts";
import { observerHarnessFailure } from "./observerHarnessFailure.ts";
import { readObserverUsage } from "./readObserverUsage.ts";
import { observerClaimIsActive, observerDeliveryReceipt, reserveObserverDelivery } from "./reserveObserverDelivery.ts";
import { stopObserverAttempt } from "./stopObserverAttempt.ts";
import {
	ObserverHarnessError,
	SESSION_OBSERVER_MODEL,
	type SessionObserverReply,
	type SessionObserverReplyInput,
} from "./types.ts";
import { waitForObserverReply } from "./waitForObserverReply.ts";

export async function generateSessionObserverReply(
	ctx: IoCtx,
	input: SessionObserverReplyInput,
	deps = { runtime: ensureNativeRuntime, start: startNative, usage: readObserverUsage },
): Promise<SessionObserverReply> {
	return sessionOperation(ctx.home, input.observerRunId, async () => {
		if (input.signal.aborted)
			throw new ObserverHarnessError("OBSERVER_REQUEST_CANCELED", "The Claude observer request was canceled.");
		if (!(await ctx.newTx((tx) => observerClaimIsActive(tx, input))))
			throw new ObserverHarnessError("OBSERVER_DISABLED", "The observer was disabled or its update was replaced.");
		const client = await deps.runtime(ctx.home);
		const host = nativeHost(ctx.home, process.env, client);
		const previous = await ctx.newTx((tx) => getRun(tx, input.observerRunId));
		const receipt = await ctx.newTx((tx) => observerDeliveryReceipt(tx, input));
		if (previous.terminalId && !receipt) {
			const active = await host.recover(previous.terminalId);
			if (active.status !== "exited")
				throw new ObserverHarnessError(
					"OBSERVER_DELIVERY_UNKNOWN",
					"The prior observer attempt is still active. Recover it before another update.",
				);
		}
		const delivery = await reserveObserverDelivery(ctx, input);
		const { run, attemptId, providerSessionId } = delivery;
		try {
			if (!delivery.replay) {
				const prompt = delivery.seed
					? `Saved observer summary:\n${delivery.seed}\n\n${input.userContext}`
					: input.userContext;
				await mkdir(run.workspaceId!, { recursive: true, mode: 0o700 });
				await deps.start(
					ctx,
					{
						run,
						config: { directory: run.workspaceId!, harness: run.harness!, accountId: null },
						attempt: delivery.attempt,
						resume: delivery.resume,
						previousAttemptId: delivery.previousAttemptId,
						resumePrompt: prompt,
						preserveAssignmentOnFailure: true,
						textOnly: { system: input.instruction, sessionId: providerSessionId },
						signal: input.signal,
						authorizeLaunch: () => ctx.newTx((tx) => observerClaimIsActive(tx, input)),
					},
					{ guide: async () => prompt },
				);
			}
			const completed = await waitForObserverReply(client, { attemptId, providerSessionId, signal: input.signal });
			const usage = await deps.usage(ctx.home, { attemptId, providerSessionId, text: completed.result.text });
			if (!(await ctx.newTx((tx) => observerClaimIsActive(tx, input))))
				throw new ObserverHarnessError("OBSERVER_DISABLED", "The observer was disabled or its update was replaced.");
			input.signal.throwIfAborted();
			return {
				text: completed.result.text,
				observerRunId: run.id,
				attemptId,
				providerSessionId,
				messageId: attemptId,
				resultId: completed.result.id,
				modelId: SESSION_OBSERVER_MODEL,
				usage,
			};
		} finally {
			await stopObserverAttempt(client, attemptId);
		}
	}).catch((error) => {
		if (error instanceof ObserverHarnessError) throw error;
		if (input.signal.aborted)
			throw new ObserverHarnessError("OBSERVER_REQUEST_CANCELED", "The Claude observer request was canceled.");
		throw observerHarnessFailure(error);
	});
}
