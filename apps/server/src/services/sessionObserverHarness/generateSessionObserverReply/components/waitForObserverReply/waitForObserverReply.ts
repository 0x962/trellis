import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ObserverHarnessError, SESSION_OBSERVER_MODEL } from "../../../types.ts";

export async function waitForObserverReply(
	client: Pick<RuntimeClient, "subscribeSession">,
	input: { attemptId: string; providerSessionId: string; signal: AbortSignal },
): Promise<RuntimeProcessStatus & { result: { id: string; text: string } }> {
	input.signal.throwIfAborted();
	for await (const event of client.subscribeSession(input.attemptId, input.signal)) {
		input.signal.throwIfAborted();
		if (event.type !== "session") continue;
		const state = event.session;
		if (state.agent?.sessionId != null && state.agent.sessionId !== input.providerSessionId)
			throw new ObserverHarnessError(
				"OBSERVER_CONVERSATION_LOST",
				"Claude reported a different observer conversation. Inspect its saved session.",
			);
		if (state.agent?.model != null && state.agent.model !== SESSION_OBSERVER_MODEL)
			throw new ObserverHarnessError(
				"OBSERVER_MODEL_UNAVAILABLE",
				"Claude did not use Sonnet 5.5. Check model access for the selected account.",
			);
		if (
			/context.{0,40}(window|length|limit)|prompt.{0,20}too long|too many.{0,20}tokens/i.test(
				state.agent?.error ?? state.error ?? "",
			)
		)
			throw new ObserverHarnessError(
				"OBSERVER_CONTEXT_CAPACITY",
				"The observer context exceeds Claude capacity. Summarize the context explicitly before another request.",
			);
		if (state.error || state.agent?.error || state.agent?.outcome === "failed")
			throw new ObserverHarnessError(
				"OBSERVER_HARNESS_FAILED",
				"Claude could not complete the observer reply. Check the selected account and its usage limit.",
			);
		if (state.agent?.outcome === "interrupted")
			throw new ObserverHarnessError("OBSERVER_REQUEST_CANCELED", "The Claude observer request was canceled.");
		if (state.agent?.attention?.requests.length)
			throw new ObserverHarnessError(
				"OBSERVER_HARNESS_FAILED",
				"Claude requires input. Check the selected account before the next observer update.",
			);
		if (state.agent?.outcome === "completed" && state.activity?.state === "idle") {
			if (
				state.agent.sessionId !== input.providerSessionId ||
				state.agent.model !== SESSION_OBSERVER_MODEL ||
				!state.acknowledgedMessageIds.includes(input.attemptId) ||
				!state.result?.text
			)
				throw new ObserverHarnessError(
					"OBSERVER_REPLY_INCOMPLETE",
					"Claude did not confirm a complete reply for this observer request.",
				);
			return { ...state, result: state.result };
		}
		if (state.status === "exited" || state.status === "unknown")
			throw new ObserverHarnessError(
				"OBSERVER_DELIVERY_UNKNOWN",
				"The observer attempt ended without a confirmed reply. Inspect its saved attempt before another update.",
			);
	}
	throw new ObserverHarnessError(
		"OBSERVER_DELIVERY_UNKNOWN",
		"The runtime stopped reporting the observer attempt. Restore the runtime before another update.",
	);
}
