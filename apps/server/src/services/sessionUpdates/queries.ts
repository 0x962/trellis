import type { SessionUpdate, SessionUpdateRequest, SessionUpdates } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

const updateColumns = sql`id, session_id AS "sessionId", run_id AS "runId", request_id AS "requestId",
	body, embeds, ${iso(sql`created_at`)} AS "createdAt"`;

const requestColumns = sql`request_id AS "requestId", ${iso(sql`requested_at`)} AS "requestedAt", state, error`;

export const getSessionUpdateRequest = async (
	tx: Tx,
	input: { runId: string },
): Promise<SessionUpdateRequest | null> => {
	const [request] = await rows<SessionUpdateRequest>(
		tx,
		sql`SELECT ${requestColumns} FROM session_update_requests WHERE run_id=${input.runId}
		ORDER BY requested_at DESC, request_id DESC LIMIT 1`,
	);
	return request ?? null;
};

export const getSessionUpdates = async (tx: Tx, input: { runId: string }): Promise<SessionUpdates> => {
	const updates = await rows<SessionUpdate>(
		tx,
		sql`SELECT ${updateColumns} FROM session_updates WHERE run_id=${input.runId}
		ORDER BY created_at DESC, id DESC LIMIT 2`,
	);
	return {
		latest: updates[0] ?? null,
		previous: updates[1] ?? null,
		request: await getSessionUpdateRequest(tx, input),
	};
};

export const sessionUpdateByRequest = async (tx: Tx, input: { runId: string; requestId: string }) => {
	const [update] = await rows<SessionUpdate>(
		tx,
		sql`SELECT ${updateColumns} FROM session_updates
		WHERE run_id=${input.runId} AND request_id=${input.requestId}`,
	);
	return update ?? null;
};
