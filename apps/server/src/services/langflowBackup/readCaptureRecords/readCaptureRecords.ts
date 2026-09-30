import { asc, eq } from "drizzle-orm";
import { agentRuns } from "../../../db/tables/agentRuns";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import { sessions } from "../../../db/tables/sessions";
import type { Tx } from "../../../db/tx";

export async function readCaptureRecords(tx: Tx) {
	const runs = await tx.select({
		agentRunId: agentRuns.id, attemptId: agentRuns.terminalId,
		workspaceId: agentRuns.workspaceId, providerSessionId: agentRuns.sessionId,
		sessionLost: agentRuns.sessionLost, sessionDirectory: sessions.directory,
	}).from(agentRuns).leftJoin(sessions, eq(sessions.runId, agentRuns.id)).orderBy(asc(agentRuns.id));
	const native = await tx.select({
		agentRunId: langflowNativeHandles.agentRunId, attemptId: langflowNativeHandles.attemptId,
		providerSessionId: langflowNativeHandles.handle,
	}).from(langflowNativeHandles).orderBy(asc(langflowNativeHandles.attemptId));
	return { runs, native: native.map((entry) => ({ ...entry, providerSessionId: entry.providerSessionId.providerSessionId })) };
}

export type CaptureRecords = Awaited<ReturnType<typeof readCaptureRecords>>;
