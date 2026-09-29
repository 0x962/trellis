import type { SessionObserverMessage, SessionObserverMessageInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { appendSessionObserverMessages } from "../appendSessionObserverMessages";
import { sessionObserverByRun } from "../queries";

export const saveSessionObserverSummary = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string; claimId: string; message: SessionObserverMessageInput & { role: "user" } },
): Promise<SessionObserverMessage | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId
	)
		return null;
	const [existing] = await rows<SessionObserverMessage>(
		tx,
		sql`SELECT id, observer_id AS "observerId", generation, position, role, body,
		${iso(sql`created_at`)} AS "createdAt" FROM session_observer_messages
		WHERE observer_id=${observer.observerId} AND generation=${observer.generation} AND position=0`,
	);
	if (existing) return existing;
	const [saved] = await appendSessionObserverMessages(tx, {
		observerId: observer.observerId,
		generation: observer.generation,
		messages: [input.message],
		createdAt: ctx.now,
	});
	return saved!;
};
