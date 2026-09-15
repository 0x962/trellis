import type { RuntimeClient } from "@trellis/runtime-protocol/client";

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
			if (event.session.status !== "running")
				throw new Error(
					"The agent process is not confirmed running. It did not acknowledge this message. Inspect its terminal before a resend.",
				);
		}
		throw new Error("The agent did not acknowledge this message. Inspect its terminal before a resend.");
	} catch (error) {
		if (signal.aborted)
			throw new Error(
				`The agent did not acknowledge this message within ${timeoutMs / 1000} seconds. Inspect its terminal before a resend.`,
			);
		throw error;
	}
}
