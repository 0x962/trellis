import {
	type SessionUpdate,
	type SessionUpdatesGetInput,
	SessionUpdatesGetInputSchema,
	type SessionUpdatesWriteInput,
	SessionUpdatesWriteInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { assertCurrentAttempt } from "../assignments.ts";
import { resolveSession } from "../sessions/index.ts";
import { getSessionUpdates, sessionUpdateByRequest } from "./queries.ts";

export const get = async (_ctx: ServiceCtx, tx: Tx, value: SessionUpdatesGetInput) => {
	const input = SessionUpdatesGetInputSchema.parse(value);
	const session = await resolveSession(tx, input.sessionId);
	return getSessionUpdates(tx, { sessionId: session.id });
};

export const write = async (ctx: ServiceCtx, tx: Tx, value: SessionUpdatesWriteInput): Promise<SessionUpdate> => {
	const input = SessionUpdatesWriteInputSchema.parse(value);
	const session = await resolveSession(tx, input.sessionId);
	if (ctx.actor?.kind !== "agent" || ctx.actor.name !== session.runId) throw fail("SESSION_UPDATE_FORBIDDEN");
	await assertCurrentAttempt(ctx, tx);
	if (input.requestId !== undefined) {
		const [request] = await rows<{ sessionId: string }>(
			tx,
			sql`SELECT session_id AS "sessionId" FROM session_update_requests WHERE request_id=${input.requestId}`,
		);
		if (request?.sessionId !== session.id)
			throw invalidInput("requestId", "This status request does not belong to the session.");
	}
	const id = ulid();
	const [saved] = await rows<SessionUpdate>(
		tx,
		sql`INSERT INTO session_updates (id, session_id, run_id, request_id, body, embeds, created_at)
		VALUES (${id}, ${session.id}, ${session.runId}, ${input.requestId ?? null}, ${input.body},
		${JSON.stringify(input.embeds ?? [])}::jsonb, ${ctx.now}) ${
			input.requestId === undefined ? sql`` : sql`ON CONFLICT (session_id, request_id) DO NOTHING`
		}
		RETURNING id, session_id AS "sessionId", run_id AS "runId", request_id AS "requestId", body, embeds,
		to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
	);
	if (saved === undefined)
		return (await sessionUpdateByRequest(tx, { sessionId: session.id, requestId: input.requestId! }))!;
	if (input.requestId !== undefined)
		await tx.execute(sql`UPDATE session_update_requests SET state='answered', error=NULL
		WHERE session_id=${session.id} AND request_id=${input.requestId}`);
	ctx.emit({ type: "session-updates.changed", id: session.id });
	return saved;
};
