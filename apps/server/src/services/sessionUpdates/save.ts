import type { SessionUpdate, SessionUpdateEmbed } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { SessionUpdateOwner } from "./owner.ts";
import { sessionUpdateByRequest } from "./queries.ts";

export type SaveSessionUpdateInput = {
	owner: SessionUpdateOwner;
	requestId?: string;
	body: string;
	embeds?: SessionUpdateEmbed[];
};

export const saveSessionUpdate = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SaveSessionUpdateInput,
): Promise<SessionUpdate> => {
	const id = ulid();
	const [saved] = await rows<SessionUpdate>(
		tx,
		sql`INSERT INTO session_updates (id, session_id, run_id, request_id, body, embeds, created_at)
		VALUES (${id}, ${input.owner.sessionId}, ${input.owner.runId}, ${input.requestId ?? null}, ${input.body},
		${JSON.stringify(input.embeds ?? [])}::jsonb, ${ctx.now}) ${
			input.requestId === undefined ? sql`` : sql`ON CONFLICT (run_id, request_id) DO NOTHING`
		}
		RETURNING id, session_id AS "sessionId", run_id AS "runId", request_id AS "requestId", body, embeds,
		to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
	);
	if (saved === undefined)
		return (await sessionUpdateByRequest(tx, { runId: input.owner.runId, requestId: input.requestId! }))!;
	if (input.requestId !== undefined)
		await tx.execute(sql`UPDATE session_update_requests SET state='answered', error=NULL
		WHERE run_id=${input.owner.runId} AND request_id=${input.requestId}`);
	ctx.emit({ type: "session-updates.changed", id: input.owner.runId });
	return saved;
};
