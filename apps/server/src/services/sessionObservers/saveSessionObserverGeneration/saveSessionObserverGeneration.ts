import type {
	SessionObserver,
	SessionObserverMessageInput,
	SessionObserverUpdateInput,
	SessionUpdate,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveSessionUpdateOwner, saveSessionUpdate } from "../../sessionUpdates";
import { appendSessionObserverMessages } from "../appendSessionObserverMessages";
import { readSessionObserver, sessionObserverByRun } from "../queries";

export type SaveSessionObserverGenerationInput = {
	runId: string;
	claimId: string;
	throughCursor: string;
	messages: SessionObserverMessageInput[];
	update: SessionObserverUpdateInput;
};

export type SessionObserverGenerationSave = {
	observer: SessionObserver;
	update: SessionUpdate;
};

export const saveSessionObserverGeneration = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SaveSessionObserverGenerationInput,
): Promise<SessionObserverGenerationSave | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId ||
		observer.generationCursor !== input.throughCursor
	)
		return null;
	await appendSessionObserverMessages(tx, {
		observerId: observer.observerId,
		generation: observer.generation,
		messages: input.messages,
		createdAt: ctx.now,
	});
	const owner = await resolveSessionUpdateOwner(tx, input.runId);
	const update = await saveSessionUpdate(ctx, tx, { owner, ...input.update });
	await tx.execute(sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		generation_cursor=NULL, last_consumed_cursor=${input.throughCursor}, last_attempted_cursor=NULL,
		error_code=NULL, error=NULL, updated_at=${ctx.now}
		WHERE run_id=${input.runId}`);
	return { observer: await readSessionObserver(tx, input.runId), update };
};
