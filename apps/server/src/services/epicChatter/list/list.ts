import { type ChatterMessage, EpicChatterListInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveEpic } from "../../epics/resolve.ts";

export const list = async (ctx: ServiceCtx, tx: Tx, value: unknown) => {
	const input = EpicChatterListInputSchema.parse(value);
	const epic = await resolveEpic(ctx, tx, input.epic);
	const found = await rows<ChatterMessage>(
		tx,
		sql`SELECT id, sender_id AS "senderId", sender_name AS "senderName",
		recipient_id AS "recipientId", recipient_name AS "recipientName", text, state, ${iso(sql`created_at`)} AS "createdAt"
		FROM chatter_messages WHERE (sender_epic_id=${epic.id} OR recipient_epic_id=${epic.id})
		${input.before ? sql`AND id < ${input.before}` : sql``} ORDER BY id DESC LIMIT 51`,
	);
	const items = found.slice(0, 50);
	return { items, nextCursor: found.length > 50 ? items[49]!.id : null };
};
