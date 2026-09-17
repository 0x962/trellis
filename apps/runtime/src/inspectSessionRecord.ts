import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { inspectProcess } from "./inspectProcess.ts";
import { inspectProcessSession } from "./inspectProcessSession.ts";
import { observedSession } from "./observedSession.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function inspectSessionRecord(record: SessionRecord): RuntimeProcessStatus {
	// After a reboot, the pid of an exited session can belong to a process of
	// another user, and proc_pidinfo then fails with EPERM. The saved exit is
	// final, so the pid of a session with an endedAt is not inspected.
	const observation =
		record.session.pid === null || record.session.endedAt !== null
			? { kind: "missing" as const }
			: inspectProcess(record.session.pid);
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
	const checkedAt = new Date().toISOString();
	const elapsedEnd =
		observed.status === "running" ? checkedAt : observed.status === "exited" ? record.session.endedAt : null;
	return {
		...record.session,
		...observed,
		checkedAt,
		elapsedMs: elapsedEnd === null ? null : Date.parse(elapsedEnd) - Date.parse(record.session.startedAt),
		launch: record.launch,
		agent: record.observations.agent,
		activity: record.activity,
		acknowledgedMessageIds: record.ledger.acknowledgedMessageIds(),
		result: record.completion.latest,
	};
}
