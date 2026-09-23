import type { RuntimeMethods } from "@trellis/runtime-protocol";
import { acceptSessionInput } from "./acceptSessionInput";
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
		acceptSessionInput(record);
	});
}
