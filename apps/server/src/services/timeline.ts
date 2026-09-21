import { TimelineListInputSchema, type TimelineListOutput } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { InvalidCursorError } from "../db/queries/support.ts";
import { timeline } from "../db/queries/timeline.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { resolveTicket } from "./refs.ts";

// The activity of one ticket, newest first, 100 items per page. `before` is
// the cursor of the previous page. The cursor is user input, so a bad cursor
// is the 400 INVALID_CURSOR and never the 500 body.
export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<TimelineListOutput> => {
	const input = TimelineListInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	try {
		return await timeline(tx, { ticketId: row.id, before: input.before, limit: input.limit });
	} catch (error) {
		if (error instanceof InvalidCursorError) throw fail("INVALID_CURSOR");
		throw error;
	}
};
