import { PageCommentReplyInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { resolveActorId } from "../../../actorIdentity/index.ts";
import { lockPage } from "../../pages.ts";
import { nextCommentCreatedAt } from "../nextCommentCreatedAt";
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
	await lockPage(ctx, tx, thread.page_id, true);
	const createdAt = await nextCommentCreatedAt(tx, thread.page_id, ctx.now);
	const actor = requireActor(ctx);
	const actorId = await resolveActorId(ctx, tx, actor);
	await tx.execute(sql`INSERT INTO page_comments (
		id, thread_id, body, actor_id, actor_name, actor_kind, created_at, updated_at
	) VALUES (${ulid()}, ${thread.id}, ${input.body}, ${actorId}, ${actor.name}, ${actor.kind}, ${createdAt}::timestamptz, ${createdAt}::timestamptz)`);
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${createdAt}::timestamptz WHERE id = ${thread.id}`);
	emitCommentsChanged(ctx, thread);
	return pageCommentThreadById(tx, thread.id);
};
