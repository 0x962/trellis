import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";

export async function waitForReceipt(
	client: Pick<RuntimeClient, "subscribeSession">,
	attemptId: string,
	messageId: string,
	timeoutMs: number,
) {
	const signal = AbortSignal.timeout(timeoutMs);
	try {
		for await (const event of client.subscribeSession(attemptId, signal)) {
			if (event.type !== "session") continue;
			if (event.session.acknowledgedMessageIds.includes(messageId)) return event.session;
			if (event.session.status !== "running") throw new Error(unconfirmedDelivery);
		}
		throw new Error(unconfirmedDelivery);
	} catch (error) {
		if (signal.aborted) throw new Error(unconfirmedDelivery);
		throw error;
	}
}
