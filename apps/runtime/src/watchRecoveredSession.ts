import { inspectProcessSession } from "./inspectProcessSession.ts";
import type { ProcessExitWatcher } from "./processExitWatcher.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function watchRecoveredSession(record: SessionRecord, exits: ProcessExitWatcher) {
	if (record.session.pid === null || record.session.endedAt !== null) return;
	const members = inspectProcessSession(record.session.pid);
	if (members.kind !== "live") return;
	for (const pid of members.pids) {
		if (record.watchedPids.has(pid)) continue;
		record.watchedPids.add(pid);
		exits.watch(pid, () => {
			record.watchedPids.delete(pid);
			watchRecoveredSession(record, exits);
			for (const listener of record.listeners) listener();
		});
	}
}
