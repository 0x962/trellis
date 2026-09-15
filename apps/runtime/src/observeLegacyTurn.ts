import type { RuntimeMethods } from "@trellis/runtime-protocol";
import { authenticateSession } from "./authenticateSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function observeLegacyTurn(record: SessionRecord, input: RuntimeMethods["turn"]["params"]) {
	authenticateSession(record, input.token);
	const state = { SessionStart: "ready", UserPromptSubmit: "working", Stop: "idle" } as const;
	record.activity = { state: state[input.event], updatedAt: new Date().toISOString() };
	record.inputPending = false;
	if (input.event === "UserPromptSubmit" && input.messageId !== undefined)
		record.ledger.acknowledge(input.messageId, input.messageId === input.id);
	if (input.event === "Stop" && input.result !== undefined) record.completion.append(input.result);
	for (const listener of record.listeners) listener();
}
