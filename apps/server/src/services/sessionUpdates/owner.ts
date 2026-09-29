import type { Tx } from "../../db/tx.ts";
import { findRun } from "../agentRuns/index.ts";
import { resolveSession, sessionIdsForRuns } from "../sessions/index.ts";

export type SessionUpdateOwner = { runId: string; sessionId: string | null };

export const resolveSessionUpdateOwner = async (tx: Tx, sessionOrRunRef: string): Promise<SessionUpdateOwner> => {
	const run = await findRun(tx, { runId: sessionOrRunRef });
	if (run !== null) {
		const sessionIds = await sessionIdsForRuns(tx, { runIds: [run.id] });
		return { runId: run.id, sessionId: sessionIds[run.id] ?? null };
	}
	const session = await resolveSession(tx, sessionOrRunRef);
	return { runId: session.runId, sessionId: session.id };
};
