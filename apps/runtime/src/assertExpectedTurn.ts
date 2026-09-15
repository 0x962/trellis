import type { RuntimeExpectedTurn } from "@trellis/runtime-protocol";
import type { SessionRecord } from "./sessionRecord.ts";

export function assertExpectedTurn(record: SessionRecord, expected?: RuntimeExpectedTurn) {
	if (
		expected !== undefined &&
		(record.observations.agent?.turnId !== expected.turnId || record.activity?.updatedAt !== expected.activityAt)
	)
		throw Object.assign(new Error("The active provider turn changed before the request"), {
			code: "RUNTIME_TURN_CHANGED",
		});
}
