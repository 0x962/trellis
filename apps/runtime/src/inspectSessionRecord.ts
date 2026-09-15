import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { inspectProcess } from "./inspectProcess.ts";
import { inspectProcessSession } from "./inspectProcessSession.ts";
import { observedSession } from "./observedSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function inspectSessionRecord(record: SessionRecord): RuntimeProcessStatus {
	const observation = record.session.pid === null ? { kind: "missing" as const } : inspectProcess(record.session.pid);
	let observed = observedSession(record.session, record.identity, observation, record.process !== undefined);
	if (
		observation.kind === "missing" &&
		observed.status === "exited" &&
		record.session.pid !== null &&
		record.session.endedAt === null
	) {
		const members = inspectProcessSession(record.session.pid);
		if (members.kind !== "empty")
			observed = {
				...observed,
				status: "unknown",
				error:
					members.kind === "unknown"
						? members.error
						: `Process session ${record.session.pid} still has live child processes: ${members.pids.join(", ")}`,
			};
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
