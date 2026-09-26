import { PageCommentResolveInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { upsert } from "../../../actors.ts";
import {
	assertPageCommentWritable,
	emitCommentsChanged,
	findPageCommentThread,
	pageCommentThreadById,
} from "../support";

export const setPageCommentResolved = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentResolveInputSchema.parse(rawInput);
	const thread = await findPageCommentThread(tx, input.thread);
	assertPageCommentWritable(ctx, thread);
	const actor = requireActor(ctx);
	if (input.resolved) await upsert(ctx, tx, actor);
	await tx.execute(
		input.resolved
			? sql`UPDATE page_comment_threads SET resolved_at = ${ctx.now}, resolved_by_name = ${actor.name},
				resolved_by_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${thread.id}`
			: sql`UPDATE page_comment_threads SET resolved_at = NULL, resolved_by_name = NULL,
				resolved_by_kind = NULL, updated_at = ${ctx.now} WHERE id = ${thread.id}`,
	);
	emitCommentsChanged(ctx, thread);
	return pageCommentThreadById(tx, thread.id);
};
