import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { readLaunchSnapshot } from "../launchSnapshot";

export async function readNativeSnapshotManifest(ctx: { home: string }, tx: Tx) {
	const reservations = await tx.select().from(langflowNativeHandles);
	const files = [];
	const unavailable = [];
	for (const row of reservations) {
		const binding = {
			executionId: row.executionId,
			stepId: row.stepId,
			agentRunId: row.agentRunId,
			attemptId: row.attemptId,
			requestDigest: row.requestDigest,
		};
		if (row.launchSnapshotDigest === null) {
			unavailable.push({ ...binding, reason: "snapshot_not_recorded" as const });
			continue;
		}
		try {
			await readLaunchSnapshot(ctx.home, row.attemptId, row.launchSnapshotDigest);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			const code = "code" in error ? error.code : null;
			const reason =
				code === "ENOENT"
					? ("snapshot_missing" as const)
					: error.message === "native_snapshot_digest_conflict"
						? ("snapshot_digest_conflict" as const)
						: code === "ELOOP" ||
								error.message === "native_snapshot_file_unsafe" ||
								error.message === "native_snapshot_directory_unsafe"
							? ("snapshot_unsafe" as const)
							: null;
			if (reason === null) throw error;
			unavailable.push({ ...binding, reason });
			continue;
		}
		files.push({
			...binding,
			path: `harness-attempts/${row.attemptId}/langflow-launch.json`,
			digest: row.launchSnapshotDigest,
		});
	}
	return { ready: unavailable.length === 0, files, unavailable };
}
