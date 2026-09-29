import type { SessionUpdateRequest, SessionUpdateRequestState } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getSessionUpdateRequest } from "./queries.ts";

type RequestCtx = Pick<ServiceCtx, "emit" | "now">;

const columns = sql`request_id AS "requestId", ${iso(sql`requested_at`)} AS "requestedAt", state, error`;

export const sessionUpdateRequestIsOutstanding = (state: SessionUpdateRequestState) =>
	state === "pending" || state === "sent";

export const beginSessionUpdateRequest = async (
	ctx: RequestCtx,
	tx: Tx,
	input: { sessionId: string; requestId: string },
): Promise<SessionUpdateRequest | null> => {
	const inserted = await rows<SessionUpdateRequest>(
		tx,
		sql`INSERT INTO session_update_requests (request_id, session_id, requested_at, state, error)
		VALUES (${input.requestId}, ${input.sessionId}, ${ctx.now}, 'pending', NULL)
		ON CONFLICT DO NOTHING RETURNING ${columns}`,
	);
	if (inserted[0] !== undefined) {
		ctx.emit({ type: "session-updates.changed", id: input.sessionId });
		return inserted[0];
	}
	const [sameRequest] = await rows<SessionUpdateRequest & { sessionId: string }>(
		tx,
		sql`SELECT session_id AS "sessionId", ${columns} FROM session_update_requests
		WHERE request_id=${input.requestId}`,
	);
	if (sameRequest !== undefined) {
		if (sameRequest.sessionId !== input.sessionId)
			throw invalidInput("requestId", "This request ID belongs to another session.");
		return {
			requestId: sameRequest.requestId,
			requestedAt: sameRequest.requestedAt,
			state: sameRequest.state,
			error: sameRequest.error,
		};
	}
	const current = await getSessionUpdateRequest(tx, input);
	return current !== null && sessionUpdateRequestIsOutstanding(current.state) ? null : current;
};

export const setSessionUpdateRequestState = async (
	ctx: RequestCtx,
	tx: Tx,
	input: { sessionId: string; requestId: string; state: "sent" | "failed"; error?: string },
): Promise<SessionUpdateRequest> => {
	if (input.state === "failed" && !input.error)
		throw invalidInput("error", "Give the error from the failed status request.");
	if (input.state === "sent" && input.error !== undefined)
		throw invalidInput("error", "A sent status request has no error.");
	const [request] = await rows<SessionUpdateRequest>(
		tx,
		sql`UPDATE session_update_requests SET state=${input.state}, error=${input.error ?? null}
		WHERE session_id=${input.sessionId} AND request_id=${input.requestId}
		AND (state='pending' OR state=${input.state}) RETURNING ${columns}`,
	);
	if (request === undefined) throw invalidInput("requestId", "This status request is not pending for the session.");
	ctx.emit({ type: "session-updates.changed", id: input.sessionId });
	return request;
};
