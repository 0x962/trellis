import { PageCommentReplyInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { upsert } from "../../../actors.ts";
import {
	assertPageCommentWritable,
	emitCommentsChanged,
	findPageCommentThread,
	pageCommentThreadById,
} from "../support";

export const replyToPageComment = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentReplyInputSchema.parse(rawInput);
	const thread = await findPageCommentThread(tx, input.thread);
	assertPageCommentWritable(ctx, thread);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	await tx.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_name, actor_kind, created_at, updated_at
	) VALUES (${ulid()}, ${thread.id}, ${input.body}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`);
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${ctx.now} WHERE id = ${thread.id}`);
	emitCommentsChanged(ctx, thread);
	return pageCommentThreadById(tx, thread.id);
};
