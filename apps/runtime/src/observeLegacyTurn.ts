import type { RuntimeMethods } from "@trellis/runtime-protocol";
import { authenticateSession } from "./authenticateSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function observeLegacyTurn(record: SessionRecord, input: RuntimeMethods["turn"]["params"]) {
	authenticateSession(record, input.token);
	const state = { SessionStart: "ready", UserPromptSubmit: "working", Stop: "idle" } as const;
	const updatedAt = new Date().toISOString();
	record.activity = {
		state: state[input.event],
		updatedAt,
		...(input.event === "UserPromptSubmit"
			? { workingSince: record.activity?.state === "working" ? record.activity.workingSince : updatedAt }
			: {}),
	};
	if (input.event === "UserPromptSubmit" && input.messageId !== undefined)
		record.ledger.acknowledge(input.messageId, input.messageId === input.id);
	if (input.event === "Stop" && input.result !== undefined) record.completion.append(input.result);
	for (const listener of record.listeners) listener();
}
