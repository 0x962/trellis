import type { RuntimeCaptureIdentity } from "@trellis/runtime-protocol";
import { readNativeCaptureIdentity } from "../../agentRuns/nativeLaunchCapture";
import type { SnapshotMetadata } from "../manifest";
import type { CaptureRecords } from "../readCaptureRecords";

export async function readCaptureIdentities(home: string, records: CaptureRecords) {
	const identities: RuntimeCaptureIdentity[] = [];
	const workspaces: { workspaceId: string; attemptId: string }[] = [];
	const unavailable: SnapshotMetadata["unavailable"] = [];
	const attempts = [...new Set([
		...records.runs.flatMap((run) => run.attemptId === null ? [] : [run.attemptId]),
		...records.native.map((entry) => entry.attemptId),
	])].sort();
	for (const run of records.runs) {
		if (run.attemptId === null) {
			if (run.workspaceId || run.sessionDirectory)
				unavailable.push({ reference: `workspace:${run.agentRunId}`, reason: "The retained workspace has no exact attempt identity." });
			if (run.providerSessionId)
				unavailable.push({ reference: `conversation:${run.agentRunId}`, reason: "The retained conversation has no exact attempt identity." });
		}
		if (run.sessionLost)
			unavailable.push({ reference: `conversation:${run.agentRunId}`, reason: "The run records missing provider session history." });
	}
	for (const attemptId of attempts) {
		const owners = [...records.runs, ...records.native].filter((entry) => entry.attemptId === attemptId);
		const loaded = await readNativeCaptureIdentity(home, attemptId);
		if (loaded.state === "unavailable") {
			for (const agentRunId of new Set(owners.map((entry) => entry.agentRunId))) {
				unavailable.push({ reference: `workspace:${agentRunId}:${attemptId}`, reason: loaded.reason });
				unavailable.push({ reference: `conversation:${agentRunId}:${attemptId}`, reason: loaded.reason });
			}
			continue;
		}
		if (loaded.identity.attemptId !== attemptId || owners.some((entry) =>
			entry.agentRunId !== loaded.identity.agentRunId ||
			(entry.providerSessionId !== null && entry.providerSessionId !== loaded.identity.providerSessionId)))
			throw new Error("paired_capture_retained_identity_conflict");
		for (const run of records.runs.filter((entry) => entry.attemptId === attemptId)) {
			if ((run.workspaceId !== null && run.workspaceId !== loaded.workspaceId) ||
				(run.sessionDirectory !== null && run.sessionDirectory !== loaded.workspaceId))
				throw new Error("paired_capture_retained_workspace_conflict");
		}
		identities.push(loaded.identity);
		workspaces.push({ workspaceId: loaded.workspaceId, attemptId });
	}
	return { identities, workspaces, unavailable };
}
