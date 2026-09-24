import type { SessionRecord } from "../sessionRecord.ts";

export function acceptSessionInput(record: SessionRecord, userInput = true) {
	if (record.session.stopReason === "idle")
		throw Object.assign(new Error("The session stopped after 30 idle minutes. Resume its saved conversation."), {
			code: "SESSION_IDLE_STOPPED",
		});
	if (userInput) record.lastInputAt = Date.now();
}
