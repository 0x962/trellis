import { assertTarget } from "@trellis/runtime-protocol/execution";
import { waitForReceipt } from "../../../../services/agentRuns/waitForReceipt.ts";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";

// The runtime takes input bytes as base64 text. The encoding stays inside
// this host, so a caller hands over bytes.
const base64 = (data: Uint8Array) => Buffer.from(data).toString("base64");

export const localInput = (deps: LocalHostDeps): Pick<LocalExecutionHost, "input"> => {
	const client = () => deps.connection.client();
	return {
		input: {
			async raw(target, data, userInput, expected) {
				assertTarget(deps.binding, target);
				return client().input(target.attemptId, base64(data), userInput, expected);
			},
			async deliver(target, messageId, data, expected) {
				assertTarget(deps.binding, target);
				return client().deliver(target.attemptId, messageId, base64(data), expected);
			},
			async queue(target, messageId, data) {
				assertTarget(deps.binding, target);
				return client().queueInput(target.attemptId, messageId, base64(data));
			},
			async receipt(target, messageId) {
				assertTarget(deps.binding, target);
				return client().hasMessage(target.attemptId, messageId);
			},
			async awaitReceipt(target, messageId, timeoutMs) {
				assertTarget(deps.binding, target);
				return waitForReceipt(client(), target.attemptId, messageId, timeoutMs);
			},
			async resize(target, cols, rows) {
				assertTarget(deps.binding, target);
				return client().resize(target.attemptId, cols, rows);
			},
		},
	};
};
