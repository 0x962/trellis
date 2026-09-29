import { type SessionUpdate, type SessionUpdatesWriteInput, SessionUpdatesWriteInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { assertCurrentAttempt } from "../assignments.ts";
import { resolveSessionUpdateOwner } from "./owner.ts";
import { saveSessionUpdate } from "./save/index.ts";

export const write = async (ctx: ServiceCtx, tx: Tx, value: SessionUpdatesWriteInput): Promise<SessionUpdate> => {
	const input = SessionUpdatesWriteInputSchema.parse(value);
	const owner = await resolveSessionUpdateOwner(tx, input.sessionId);
	if (ctx.actor?.kind !== "agent" || ctx.actor.name !== owner.runId) throw fail("SESSION_UPDATE_FORBIDDEN");
	await assertCurrentAttempt(ctx, tx);
	if (input.requestId !== undefined) {
		const [request] = await rows<{ runId: string }>(
			tx,
			sql`SELECT run_id AS "runId" FROM session_update_requests WHERE request_id=${input.requestId}`,
		);
		if (request?.runId !== owner.runId)
			throw invalidInput("requestId", "This status request does not belong to the session.");
	}
	return saveSessionUpdate(ctx, tx, { owner, ...input });
};
