import { TimelineListInputSchema, type TimelineListOutput } from "@trellis/api";
import type { Ctx } from "../context.ts";
import { timeline } from "../db/queries/timeline.ts";
import type { Tx } from "../db/tx.ts";
import { resolveTicket } from "./refs.ts";

// The comments and the activity of one ticket as one stream, newest first,
// 100 items per page. `before` is the cursor of the previous page.
export const list = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<TimelineListOutput> => {
	const input = TimelineListInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	return timeline(tx, { ticketId: row.id, before: input.before, limit: input.limit });
};
