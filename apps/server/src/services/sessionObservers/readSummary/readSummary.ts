import type { SessionObserverMessage } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { sessionObserverByRun } from "../queries";

export const readSessionObserverSummaryForClaim = async (
	tx: Tx,
	input: { runId: string; claimId: string; observerRunId: string; summaryMessageId: string },
): Promise<SessionObserverMessage | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId ||
		observer.observerRunId !== input.observerRunId
	)
		return null;
	const [message] = await rows<SessionObserverMessage>(
		tx,
		sql`SELECT id, observer_id AS "observerId", generation, position, role, body,
		${iso(sql`created_at`)} AS "createdAt" FROM session_observer_messages
		WHERE id=${input.summaryMessageId} AND observer_id=${observer.observerId}
		AND generation=${observer.generation} AND position=0 AND role='user'`,
	);
	return message ?? null;
};
