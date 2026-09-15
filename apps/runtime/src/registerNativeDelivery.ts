import type { RuntimeMethods } from "@trellis/runtime-protocol";
import { assertExpectedTurn } from "./assertExpectedTurn.ts";
import { authenticateSession } from "./authenticateSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function registerNativeDelivery(
	record: SessionRecord,
	input: RuntimeMethods["registerNativeDelivery"]["params"],
) {
	authenticateSession(record, input.token);
	return record.ledger.registerNative(input.messageId, input.promptDigest, () => {
		assertExpectedTurn(record, input.expected);
		if (
			input.requireIdle &&
			(record.inputPending ||
				record.activity === null ||
				!(
					record.activity.state === "idle" ||
					(input.messageId === record.session.id && record.activity.state === "ready")
				))
		)
			throw Object.assign(new Error("The agent is not idle"), { code: "RUNTIME_BUSY" });
		record.inputPending = true;
	});
}
