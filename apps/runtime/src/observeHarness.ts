import type { HarnessEvent } from "@trellis/runtime-protocol";
import type { SessionRecord } from "./sessionRecord.ts";

export function observeHarness(record: SessionRecord, event: HarnessEvent) {
	const updatedAt = new Date().toISOString();
	if (!record.observations.append(event, updatedAt)) return;
	if (event.kind === "prompt") {
		const messageId = /^trellis-message:([a-zA-Z0-9_-]{1,128})(?:\r?\n|$)/.exec(event.prompt ?? "")?.[1];
		if (messageId !== undefined) record.ledger.acknowledge(messageId, messageId === record.session.id);
	}
	if (
		event.kind === "idle" &&
		event.result !== undefined &&
		event.outcome !== "failed" &&
		event.outcome !== "interrupted"
	)
		record.completion.append(event.result);
	record.activity = record.observations.activity;
	for (const listener of record.listeners) listener();
}
