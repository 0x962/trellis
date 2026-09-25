import { PageCommentEditInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../../context.ts";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { fail, invalidInput } from "../../../../errors.ts";
import { assertPageCommentWritable, emitCommentsChanged, findPageComment, pageCommentThreadById } from "../support";

export const editPageComment = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentEditInputSchema.parse(rawInput);
	const comment = await findPageComment(tx, input.id);
	assertPageCommentWritable(ctx, comment);
	const actor = requireActor(ctx);
	if (comment.actor_name !== actor.name || comment.actor_kind !== actor.kind)
		throw invalidInput("id", "Edit your own comment only.");
	const updated = await rows<{ id: string }>(
		tx,
		sql`UPDATE page_comments SET body = ${input.body}, updated_at = ${ctx.now}
			WHERE id = ${comment.comment_id} AND deleted_at IS NULL RETURNING id`,
	);
	if (updated.length === 0) throw fail("NOT_FOUND", { kind: "page comment", ref: comment.comment_id });
	await tx.execute(sql`UPDATE page_comment_threads SET updated_at = ${ctx.now} WHERE id = ${comment.id}`);
	emitCommentsChanged(ctx, comment);
	return pageCommentThreadById(tx, comment.id);
};
