import type { SnapshotMetadata } from "../manifest";
import type { CaptureRecords } from "../readCaptureRecords";

export function uncapturedHistory(records: CaptureRecords): SnapshotMetadata["unavailable"] {
	const unavailable: SnapshotMetadata["unavailable"] = [];
	for (const run of records.runs) {
		if (run.workspaceId || run.sessionDirectory)
			unavailable.push({ reference: `workspace:${run.agentRunId}`, reason: "The workspace has no held archive export." });
		if (run.providerSessionId || run.sessionLost)
			unavailable.push({ reference: `conversation:${run.agentRunId}`, reason: "The provider conversation has no held archive export." });
	}
	for (const attempt of records.native) {
		if (records.runs.some((run) => run.attemptId === attempt.attemptId)) continue;
		unavailable.push({ reference: `workspace:${attempt.agentRunId}:${attempt.attemptId}`, reason: "The retained native attempt has no held workspace archive." });
		unavailable.push({ reference: `conversation:${attempt.agentRunId}:${attempt.attemptId}`, reason: "The retained native attempt has no held conversation archive." });
	}
	return unavailable;
}
