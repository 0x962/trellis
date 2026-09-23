import type { SessionRecord } from "../sessionRecord.ts";

const idleTimeoutMs = 5 * 60 * 1000;

export function expireIdleSessions(
	records: Iterable<SessionRecord>,
	save: (record: SessionRecord) => void,
	now = Date.now(),
) {
	for (const record of records) {
		const agent = record.observations.agent;
		if (
			!record.process ||
			record.session.status !== "running" ||
			record.session.stopReason !== undefined ||
			!agent?.sessionId ||
			agent.tool !== null ||
			(agent.attention?.requests.length ?? 0) > 0 ||
			record.activity?.state !== "idle" ||
			now - Date.parse(record.activity.updatedAt) <= idleTimeoutMs ||
			now - (record.lastInputAt ?? 0) <= idleTimeoutMs ||
			record.ledger.hasUnacknowledgedMessages()
		)
			continue;
		// acceptSessionInput rejects new messages after this synchronous check sets stopReason.
		record.session.stopReason = "idle";
		clearTimeout(record.timer);
		record.retainForResume = true;
		save(record);
		record.process.stop();
	}
}
