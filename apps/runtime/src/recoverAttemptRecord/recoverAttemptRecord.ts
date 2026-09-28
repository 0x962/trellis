import { dirname } from "node:path";
import { stopAttemptProcesses } from "../attemptProcesses";
import { canceledSession } from "../canceledSession";
import { inspectSessionRecord } from "../inspectSessionRecord.ts";
import { processIdentity } from "../processIdentity";
import type { SessionRecords } from "../sessionRecords";
import { stopProcessTree } from "../stopProcessTree.ts";

export async function recoverAttemptRecord(home: string, daemonId: string, id: string, records: SessionRecords) {
	let record = records.get(id);
	if (record) {
		const current = inspectSessionRecord(record);
		if ((current.status === "exited" && record.session.endedAt !== null) || current.controllable) return current;
	} else {
		record = canceledSession(home, daemonId, id);
		record.session.status = "unknown";
		record.session.endedAt = null;
		record.session.error = null;
		records.set(id, record);
		records.save(record);
	}
	// The saved attempt prevents a concurrent start from launching this identifier.
	// Every agent and its children inherit the attempt and runtime directory markers.
	if (record.session.pid !== null) {
		const leader = processIdentity(record.session.pid);
		if (leader.kind === "unknown") throw new Error(leader.error);
		if (leader.kind === "missing" || leader.process.identity === record.identity)
			await stopProcessTree(record.session.pid);
	}
	await stopAttemptProcesses(dirname(home), id);
	record.session.status = "exited";
	record.session.endedAt = new Date().toISOString();
	record.session.exitCode = null;
	record.session.error = null;
	records.save(record);
	return inspectSessionRecord(record);
}
