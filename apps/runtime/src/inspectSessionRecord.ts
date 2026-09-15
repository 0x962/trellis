import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { inspectProcess } from "./inspectProcess.ts";
import { inspectProcessSession } from "./inspectProcessSession.ts";
import { observedSession } from "./observedSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function inspectSessionRecord(record: SessionRecord): RuntimeProcessStatus {
	const observation = record.session.pid === null ? { kind: "missing" as const } : inspectProcess(record.session.pid);
	let observed = observedSession(record.session, record.identity, observation, record.process !== undefined);
	if (observed.status === "exited" && record.session.pid !== null && record.session.endedAt === null) {
		const error = inspectProcessSession(record.session.pid);
		if (error !== null) observed = { ...observed, status: "unknown", error };
	}
	return {
		...record.session,
		...observed,
		checkedAt: new Date().toISOString(),
		launch: record.launch,
		activity: record.activity,
		acknowledgedMessageIds: record.ledger.acknowledgedMessageIds(),
		result: record.completion.latest,
	};
}
